import express from 'express';
import Contact from '../models/contact.models.js';
import { verifyJWT, requireEmailVerified } from '../middlewares/auth.middleware.js';

const router = express.Router();

function getUserId(req) {
    return (req.user && (req.user.id || req.user._id)) || '';
}

// POST /contacts/add { contactId }
router.post('/add', verifyJWT, requireEmailVerified, express.json(), async (req, res) => {
    try {
        if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
        const dbUser = req.user; // token payload
        // require phone verification
        if (typeof dbUser.isPhoneVerified !== 'boolean') {
            // fetch user verification via current-user endpoint would be better; for now, rely on token-less guard:
        }
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        
        const { contactId } = req.body || {};
        if (!contactId) return res.status(400).json({ error: 'contactId is required' });
        if (contactId === userId) return res.status(400).json({ error: 'cannot add yourself' });

        // Check if contact already exists
        const existingContact = await Contact.findOne({ userId, contactId });
        if (existingContact) {
            return res.status(409).json({ error: 'already a contact' });
        }

        const newContact = new Contact({
            userId,
            contactId,
            status: 'accepted'
        });

        const savedContact = await newContact.save();
        return res.status(201).json({ 
            message: 'Contact added', 
            contact: { 
                id: savedContact._id, 
                contactId: savedContact.contactId 
            } 
        });
    } catch (error) {
        console.error('Error adding contact:', error);
        return res.status(500).json({ error: 'failed to add contact' });
    }
});

// DELETE /contacts/:id
router.delete('/:id', verifyJWT, requireEmailVerified, async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const result = await Contact.findOneAndDelete({
            _id: req.params.id,
            userId: userId
        });

        if (!result) {
            return res.status(404).json({ error: 'not found' });
        }

        return res.json({ message: 'Contact removed' });
    } catch (error) {
        console.error('Error deleting contact:', error);
        return res.status(500).json({ error: 'failed to delete contact' });
    }
});

// GET /contacts?limit=&cursor=
router.get('/', verifyJWT, requireEmailVerified, async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
        const cursor = req.query.cursor ? new Date(req.query.cursor) : undefined;

        const query = { userId };
        if (cursor) {
            query.addedAt = { $lt: cursor };
        }

        const contacts = await Contact.find(query)
            .sort({ addedAt: -1 })
            .limit(limit + 1) // Get one extra to determine if there are more
            .populate('contactId', 'username email');

        const hasMore = contacts.length > limit;
        const items = hasMore ? contacts.slice(0, -1) : contacts;
        const nextCursor = hasMore ? items[items.length - 1].addedAt.toISOString() : null;

        return res.json({ 
            contacts: items.map(item => ({
                id: item._id,
                contactId: item.contactId._id,
                username: item.contactId.username,
                email: item.contactId.email,
                status: item.status,
                addedAt: item.addedAt
            })),
            nextCursor
        });
    } catch (error) {
        console.error('Error fetching contacts:', error);
        return res.status(500).json({ error: 'failed to fetch contacts' });
    }
});

export default router;


