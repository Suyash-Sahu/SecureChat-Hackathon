import { fileURLToPath, pathToFileURL } from 'url';
import { join, dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function mountAuth(app) {
    try {
        const authRoutesPath = pathToFileURL(join(__dirname, 'routes', 'auth.routes.js')).href;
        const healthRoutesPath = pathToFileURL(join(__dirname, 'routes', 'healthCheck.routes.js')).href;

        // Dynamically import ESM routers
        const authModule = await import(authRoutesPath);
        const healthModule = await import(healthRoutesPath);

		if (authModule && authModule.default) {
			app.use('/api/v1/auth', authModule.default);
		}
		if (healthModule && healthModule.default) {
			app.use('/api/v1/healthcheck', healthModule.default);
		}

		// Optionally connect DB if connection module and URI exist
        const dbIndexPath = pathToFileURL(join(__dirname, 'database', 'index.js')).href;
		try {
			const dbModule = await import(dbIndexPath);
			if ((process.env.MONGODB_URI || process.env.MONGO_URI) && dbModule && dbModule.default) {
				await dbModule.default();
				console.log('✅ Authentication DB connected');
			} else {
				console.log('ℹ️ Skipping auth DB connect (no URI provided)');
			}
		} catch (e) {
			console.warn('⚠️ Could not initialize auth database:', e && e.message);
		}
		console.log('✅ Authentication routes mounted');
	} catch (err) {
		console.warn('⚠️ Auth module not mounted:', err && err.message);
	}
}



