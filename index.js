const express = require('express');
const { put } = require('@vercel/blob');
const multer = require('multer');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/upload-avatar', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'Missing Token.' });

    const blob = await put(`avatars/${Date.now()}-avatar.jpg`, req.file.buffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    res.json({ url: blob.url });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;
