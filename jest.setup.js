// Runs before every test file: a real key in the developer's shell or .env must never turn a
// test run into a billed AssemblyAI session.
delete process.env.ASSEMBLYAI_API_KEY;
