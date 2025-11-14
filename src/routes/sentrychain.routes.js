import express from 'express';
import sentryChain from '../services/sentrychain.service.js';

const router = express.Router();

/**
 * @route   POST /chain/add
 * @desc    Add a new block to the blockchain
 * @access  Internal service only
 */
router.post('/add', (req, res) => {
    try {
        const { eventType, fileHash, fileName, uploaderId, conversationId, quarantineId } = req.body;
        
        // Validate required fields
        if (!eventType || !fileHash || !uploaderId) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields: eventType, fileHash, uploaderId'
            });
        }
        
        // Build the block data according to PRD specification
        const blockData = {
            eventType,
            fileHash,
            ...(fileName && { fileName }),
            uploaderId,
            ...(conversationId && { conversationId }),
            ...(quarantineId && { quarantineId })
        };
        
        // Add the block to the chain
        const newBlock = sentryChain.addBlock(blockData);
        
        res.status(201).json({
            status: 'success',
            blockIndex: newBlock.index,
            message: 'Block added successfully'
        });
    } catch (error) {
        console.error('Error adding block to chain:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to add block to chain: ' + error.message
        });
    }
});

/**
 * @route   GET /chain
 * @desc    Get the full blockchain for audits
 * @access  Public
 */
router.get('/', (req, res) => {
    try {
        const chain = sentryChain.getChain();
        res.status(200).json({
            status: 'success',
            chain: chain,
            length: chain.length
        });
    } catch (error) {
        console.error('Error retrieving chain:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to retrieve chain: ' + error.message
        });
    }
});

/**
 * @route   GET /chain/validate
 * @desc    Validate the integrity of the blockchain
 * @access  Public
 */
router.get('/validate', (req, res) => {
    try {
        const validationResult = sentryChain.validateChain();
        res.status(200).json({
            status: 'success',
            ...validationResult
        });
    } catch (error) {
        console.error('Error validating chain:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to validate chain: ' + error.message
        });
    }
});

/**
 * @route   GET /chain/blocks/:index
 * @desc    Get a specific block by index
 * @access  Public
 */
router.get('/blocks/:index', (req, res) => {
    try {
        const index = parseInt(req.params.index);
        
        // Validate index parameter
        if (isNaN(index) || index < 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid block index'
            });
        }
        
        const block = sentryChain.getBlockByIndex(index);
        
        if (!block) {
            return res.status(404).json({
                status: 'error',
                message: `Block with index ${index} not found`
            });
        }
        
        res.status(200).json({
            status: 'success',
            block: block
        });
    } catch (error) {
        console.error('Error retrieving block:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to retrieve block: ' + error.message
        });
    }
});

export default router;