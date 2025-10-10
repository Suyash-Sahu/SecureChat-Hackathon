import express from 'express';
import multer from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { UPLOAD_DIR } from '../utils/constants.js';
import { fileScanMiddleware } from '../middlewares/fileScan.middleware.js';

const router = express.Router();

const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, UPLOAD_DIR);
	},
    filename: function (req, file, cb) {
		const uniqueName = uuidv4();
		const extension = extname(file.originalname);
		cb(null, uniqueName + extension);
	},
});

const upload = multer({
	storage,
	limits: { fileSize: 25 * 1024 * 1024 },
	fileFilter: function (req, file, cb) {
		const allowedTypes = [
			'image/jpeg',
			'image/jpg',
			'image/png',
			'image/gif',
			'application/pdf',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'text/plain',
		];
		if (allowedTypes.includes(file.mimetype)) {
			cb(null, true);
		} else {
			cb(new Error('Invalid file type. Only images, PDFs, documents, and text files are allowed.'), false);
		}
	},
});

router.post('/', upload.single('file'), fileScanMiddleware, (req, res) => {
	// Host/protocol detection similar to original server
	const host = req.get('host') || 'localhost:3000';
	const protocol = req.get('x-forwarded-proto') || 'http';
	const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

	return res.json({
		success: true,
		file: {
			originalName: req.file.originalname,
			filename: req.file.filename,
			size: req.file.size,
			mimetype: req.file.mimetype,
			url: fileUrl,
		},
	});
});

export default router;


