// Tests must never touch the real project, so provide fake config before any
// module reads process.env at require time.
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-admin-password";
process.env.ADMIN_JWT_SECRET = "test-jwt-secret-value-for-unit-tests-only";
process.env.ADMIN_TOKEN_TTL = "1h";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.NODE_ENV = "test";
