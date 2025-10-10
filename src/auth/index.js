import dotenv from "dotenv";
import app from "./app.js"
import connectDB from "./database/index.js"

dotenv.config({
    path: "./.env",
});

const port = process.env.PORT || 3000;

console.log(process.env.PORT)



connectDB()
    .then(()=>{
        app.listen(port, () => {
            console.log(`Example app listning on port http://localhost:${port}`)
        })
    })
    .catch((err)=>{
        console.error("MongoDB connection error", err)
        process.exit(1)
    })