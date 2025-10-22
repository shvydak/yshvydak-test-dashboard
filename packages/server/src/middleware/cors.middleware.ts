import cors from 'cors'

export const corsOptions = {
    origin: true, // Allow all origins for development
    credentials: false,
    optionsSuccessStatus: 200,
}

export const corsMiddleware = cors(corsOptions)
