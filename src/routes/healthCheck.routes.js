import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
	res.json({
		message: 'Server is working!',
		timestamp: new Date().toISOString(),
		endpoints: {
			upload: '/upload (POST)',
			test: '/test (GET)',
			root: '/ (GET)'
		}
	});
});

export default router;


