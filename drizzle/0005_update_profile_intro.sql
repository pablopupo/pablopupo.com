UPDATE "site_settings"
SET
	"intro_markdown" = 'I’m an AI engineer currently building applied AI systems in healthcare. I share projects, open-source work, and technical notes, alongside classical piano performances and writing about music.',
	"updated_at" = now(),
	"version" = "version" + 1
WHERE "singleton_key" = 'default'
	AND "intro_markdown" = 'I’m a software engineer focused on applied AI, open source, and reliable systems. I’m also a classical pianist.';
