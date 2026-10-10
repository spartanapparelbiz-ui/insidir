import { migrate, pool } from "./db.mjs";
try {await migrate();console.log("Insidir database migrated")}catch(e){console.error(e);process.exitCode=1}finally{await pool?.end()}
