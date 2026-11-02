const express = require('express');
const multer = require('multer');
const path = require('path');
const { put } = require('@vercel/blob'); 

const app = express();

// Use memory storage so we don't write to the local disk
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/upload-avatar', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error("MISSING TOKEN: BLOB_READ_WRITE_TOKEN is not set.");
      return res.status(500).json({ error: 'Server configuration error: Missing Vercel Blob Token.' });
    }

    const blob = await put(`avatars/${Date.now()}-avatar.jpg`, req.file.buffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN, 
    });

    res.json({ url: blob.url });

  } catch (error) {
    console.error('Upload error details:', error);
    res.status(500).json({ error: error.message || 'Upload failed.' });
  }
});

module.exports = app;
