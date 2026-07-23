import "dotenv/config";
import { loginServerFn } from "../src/lib/auth/login.function";

console.log("loginServerFn url:", (loginServerFn as any).url);
console.log("loginServerFn meta:", (loginServerFn as any).serverFnMeta);
