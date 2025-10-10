import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(__dirname, '..', '..', 'uploads');

try {
    if (!existsSync(UPLOAD_DIR)) {
        mkdirSync(UPLOAD_DIR, { recursive: true });
        console.log(`📁 Created upload directory at: ${UPLOAD_DIR}`);
    } else {
        console.log(`📁 Using upload directory: ${UPLOAD_DIR}`);
    }
} catch (e) {
    console.error('Failed to prepare upload directory:', e);
}

export {
    UPLOAD_DIR
};


