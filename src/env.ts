// Validate required environment variables
function validateEnv<T extends string>(value: T | undefined, name: string): T {
     if (!value) {
         throw new Error(`${name} environment variable is required`);
     }
     return value;
 }

 export const OPENAI_API_KEY = validateEnv(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY');
 export const NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? "";
 export const DATABASE_URL = validateEnv(process.env.DATABASE_URL, "DATABASE_URL");
 export const ARTIST_DATABASE_URL = validateEnv(process.env.ARTIST_DATABASE_URL, "ARTIST_DATABASE_URL");
 export const SPOTIFY_CLIENT_ID = validateEnv(process.env.SPOTIFY_CLIENT_ID, "SPOTIFY_CLIENT_ID");
 export const SPOTIFY_CLIENT_SECRET = validateEnv(process.env.SPOTIFY_CLIENT_SECRET, "SPOTIFY_CLIENT_SECRET");
 export const NEXTAUTH_SECRET = validateEnv(process.env.NEXTAUTH_SECRET, "NEXTAUTH_SECRET");
