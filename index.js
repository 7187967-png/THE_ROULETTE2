const express = require('express');
const multer = require('multer');
const path = require('path');
const { put } = require('@vercel/blob'); 

const app = express();

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 } // Limit to 4MB to stay under Vercel's limit
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/upload-avatar', upload.single('avatar'), async (req, res) => {
  console.log("--- UPLOAD REQUEST RECEIVED ---");
  try {
    if (!req.file) {
      console.log("ERROR: No file found in request.");
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.log("ERROR: BLOB_READ_WRITE_TOKEN is missing in Vercel settings.");
      return res.status(500).json({ error: 'Server configuration error: Missing Token.' });
    }

    console.log("Uploading to Vercel Blob...");
    const blob = await put(`avatars/${Date.now()}-avatar.jpg`, req.file.buffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN, 
    });

    console.log("SUCCESS: Uploaded to", blob.url);
    res.json({ url: blob.url });

  } catch (error) {
    console.error('UPLOAD ERROR DETAILS:', error);
    res.status(500).json({ error: error.message || 'Upload failed.' });
  }
});

module.exports = app;
