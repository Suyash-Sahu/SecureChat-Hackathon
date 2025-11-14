import Queue from 'bull';
import anchoringService from '../services/anchoring.service.js';
import Anchor from '../models/anchor.models.js';
import SuspiciousFile from '../models/suspiciousFile.models.js';

// Create a new queue for anchoring jobs
// In production, you would connect to a Redis instance
const anchoringQueue = new Queue('anchoring', process.env.REDIS_URL || 'redis://127.0.0.1:6379');

// Process anchoring jobs
anchoringQueue.process(async (job, done) => {
    try {
        const { consentHash, role, relatedMessageId, relatedFileId } = job.data;
        
        console.log(`Processing anchoring job for consent hash: ${consentHash}`);
        
        // Call the anchoring service to anchor the consent hash
        const result = await anchoringService.anchorConsent(consentHash, role, relatedMessageId);
        
        // Save the anchor record to the database
        const anchor = await Anchor.create({
            consentHash,
            role,
            txHash: result.txHash,
            blockNumber: result.blockNumber,
            status: result.status,
            relatedMessageId,
            relatedFileId
        });
        
        // Update the suspicious file record if applicable
        if (relatedFileId) {
            const updateData = role === 'sender' 
                ? { txHash_sender: result.txHash, status: 'sender_anchored' }
                : { txHash_receiver: result.txHash, status: 'receiver_anchored' };
                
            await SuspiciousFile.findByIdAndUpdate(relatedFileId, updateData);
        }
        
        console.log(`Successfully anchored consent hash: ${consentHash}`);
        done(null, { anchorId: anchor._id, txHash: result.txHash });
    } catch (error) {
        console.error('Anchoring job failed:', error);
        
        // Update the anchor record with failed status if it was created
        try {
            const anchor = await Anchor.findOne({ relatedMessageId: job.data.relatedMessageId });
            if (anchor) {
                anchor.status = 'failed';
                await anchor.save();
            }
            
            // Update the suspicious file record with failed status
            if (job.data.relatedFileId) {
                await SuspiciousFile.findByIdAndUpdate(job.data.relatedFileId, { status: 'failed' });
            }
        } catch (dbError) {
            console.error('Failed to update database after anchoring failure:', dbError);
        }
        
        done(error);
    }
});

// Function to add a new anchoring job to the queue
export function enqueueAnchoringJob(consentHash, role, relatedMessageId, relatedFileId = null) {
    return anchoringQueue.add({
        consentHash,
        role,
        relatedMessageId,
        relatedFileId
    }, {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000
        }
    });
}

export default anchoringQueue;