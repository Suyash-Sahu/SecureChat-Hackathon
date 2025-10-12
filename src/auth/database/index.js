import mongoose from "mongoose"

const connectDB = async()=>{
    try {
        const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!uri) {
            throw new Error("Missing MONGO_URI/MONGODB_URI in environment");
        }

        // Optimized connection options
        const options = {
            // Connection timeout settings
            serverSelectionTimeoutMS: 10000, // 10 seconds timeout
            connectTimeoutMS: 10000, // 10 seconds connection timeout
            socketTimeoutMS: 45000, // 45 seconds socket timeout
            
            // Connection pool settings
            maxPoolSize: 10, // Maximum number of connections
            minPoolSize: 5, // Minimum number of connections
            maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
            
            // Retry settings
            retryWrites: true,
            retryReads: true,
            
            // Compression
            compressors: ['zlib'],
            
            // Heartbeat
            heartbeatFrequencyMS: 10000, // 10 seconds
        };

        console.log("🔄 Connecting to MongoDB...");
        const startTime = Date.now();
        
        await mongoose.connect(uri, options);
        
        const connectionTime = Date.now() - startTime;
        console.log(`✅ MongoDB connected successfully in ${connectionTime}ms`);
        
        // Connection event listeners
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ MongoDB disconnected');
        });
        
        mongoose.connection.on('reconnected', () => {
            console.log('🔄 MongoDB reconnected');
        });
        
    } catch (error) {
        console.error("❌ MONGODB connection error:", error.message);
        
        // More specific error handling
        if (error.name === 'MongoServerSelectionError') {
            console.error("💡 Possible solutions:");
            console.error("   - Check your internet connection");
            console.error("   - Verify MongoDB Atlas IP whitelist");
            console.error("   - Check if MongoDB URI is correct");
        }
        
        process.exit(1);
    }
}

export default connectDB;