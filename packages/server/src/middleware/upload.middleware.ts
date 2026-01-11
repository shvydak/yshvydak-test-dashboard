import multer from 'multer'

// Configure multer to store files in memory (as buffers)
// This allows us to process the file and save it to permanent storage
const storage = multer.memoryStorage()

// File filter to only accept image files
const fileFilter = (
    req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true)
    } else {
        cb(new Error('Only image files are allowed'))
    }
}

// Create multer instance with limits
export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max file size
    },
})

// Middleware for single image upload
export const uploadSingleImage = upload.single('image')
