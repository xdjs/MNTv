import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  

};

const withPWA = require('next-pwa')({
     dest: 'public',
     register: true,
     skipWaiting: true,
     disable: process.env.NODE_ENV === 'development', // Disable PWA in development
});

export default withPWA(nextConfig)
