const express = require('express');
const { put } = require('@vercel/blob');
const multer = require('multer');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() }); // Keep file in memory

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// API route for avatar uploads
app.post('/api/upload-avatar', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    // Upload to Vercel Blob. Requires BLOB_READ_WRITE_TOKEN env var.
    const blob = await put(`avatars/${Date.now()}-${req.file.originalname}`, req.file.buffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    res.json({ url: blob.url });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed.' });
  }
});

// For local development
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

// Export for Vercel
module.exports = app;