const express = require('express');
const multer = require('multer');
const path = require('path');
const { put } = require('@vercel/blob'); // Import Vercel Blob

const app = express();

// Use memory storage so files are not written to the local disk
const upload = multer({ storage: multer.memoryStorage() });

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/upload-avatar', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    // Upload the buffer directly to Vercel Blob
    const blob = await put(`avatars/${Date.now()}-avatar.jpg`, req.file.buffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN, // Reads the token from Vercel environment variables
    });

    // Return the public URL of the uploaded image
    res.json({ url: blob.url });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed.' });
  }
});

// Export the app for Vercel (Essential for serverless functions)
module.exports = app;

// Keep listen() for local development only
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
