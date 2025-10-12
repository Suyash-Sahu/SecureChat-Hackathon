import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function mountAuth(app) {
    try {
        // Import auth routes
        const authRouter = (await import('./routes/auth.routes.js')).default;
        
        // Mount auth routes
        app.use('/api/v1/auth', authRouter);
        
        console.log('✅ Authentication routes mounted');
    } catch (err) {
        console.error('❌ Failed to mount auth routes:', err);
        throw err; // Re-throw to handle in server.js
    }
}



