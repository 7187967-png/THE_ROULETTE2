const express = require('express');
const { put } = require('@vercel/blob');
const multer = require('multer');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static('public')); // Make sure your html/css/js are in a 'public' folder

app.post('/api/upload-avatar', upload.single('avatar'), async (req, res) => {
  console.log("🚨 SERVER RECEIVED UPLOAD REQUEST 🚨");
  console.log("File exists:", !!req.file);
  console.log("Token exists:", !!process.env.BLOB_READ_WRITE_TOKEN);

  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const blob = await put(`avatars/${Date.now()}-avatar.jpg`, req.file.buffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    console.log("✅ UPLOAD SUCCESS:", blob.url);
    res.json({ url: blob.url });
  } catch (error) {
    console.error('❌ UPLOAD ERROR:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;
