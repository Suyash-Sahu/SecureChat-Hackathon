import { promises as fs } from 'fs';
import { extname } from 'path';
import * as Jimp from 'jimp';

let JimpInstance = Jimp;
if (!Jimp.read && (Jimp.Jimp || Jimp.default)) {
    JimpInstance = Jimp.Jimp || Jimp.default;
}

async function fileScanMiddleware(req, res, next) {
	try {
		if (!req.file) {
			return res.status(400).json({ error: 'No file uploaded', details: 'The request did not contain a file' });
		}

        const isPng = (req.file.mimetype === 'image/png') || (extname(req.file.originalname || '').toLowerCase() === '.png');
        if (!isPng) {
            return next();
        }

        const filePath = req.file.path;
        try {
            const image = await JimpInstance.read(filePath);
            const data = image.bitmap.data; // RGBA sequential
            const bits = [];
            for (let i = 0; i < data.length; i += 4) {
                bits.push(data[i] & 1);
                bits.push(data[i + 1] & 1);
                bits.push(data[i + 2] & 1);
            }

            const nBytes = Math.floor(bits.length / 8);
            let message = '';
			for (let b = 0; b < nBytes; b++) {
				let val = 0;
				for (let j = 0; j < 8; j++) {
					val |= (bits[b * 8 + j] & 1) << (7 - j);
				}
				if (val === 0) break; // null terminator
				if (val >= 32 && val <= 126) {
					message += String.fromCharCode(val);
					if (message.length > 2048) break;
				} else {
					break;
				}
			}

			if (message.length > 0) {
				try { await fs.unlink(filePath); } catch (e) {}
				return res.status(400).json({
					error: 'Image blocked: suspected hidden data detected',
					code: 'LSB_BLOCKED'
				});
			}
		} catch (err) {
			try { await fs.unlink(filePath); } catch (e) {}
			return res.status(400).json({
				error: 'Image could not be analyzed and was blocked',
				code: 'LSB_ANALYSIS_FAILED'
			});
		}

		return next();
	} catch (error) {
		return next(error);
	}
}

export { fileScanMiddleware };


