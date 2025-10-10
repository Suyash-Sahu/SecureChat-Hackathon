import mongoose from "mongoose"

const connectDB = async()=>{
    try {
        const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!uri) {
            throw new Error("Missing MONGO_URI/MONGODB_URI in environment");
        }
        await mongoose.connect(uri);
        console.log("MongoDB connected")
    } catch (error) {
        console.error("MONGODB connection error",error)
        process.exit(1)
    }
}

export default connectDB;