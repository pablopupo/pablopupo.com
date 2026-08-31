UPDATE "site_settings"
SET
	"headline" = CASE
		WHEN "headline" = 'Software Engineer, Applied AI'
		THEN 'AI Engineer at Handtevy'
		ELSE "headline"
	END,
	"intro_markdown" = CASE
		WHEN "intro_markdown" = 'I’m an AI engineer currently building applied AI systems in healthcare. I share projects, open-source work, and technical notes, alongside classical piano performances and writing about music.'
		THEN 'CS student at UF. AI engineer at Handtevy. Classical pianist and music enthusiast.'
		ELSE "intro_markdown"
	END,
	"about_markdown" = CASE
		WHEN "about_markdown" = 'I study computer science at the University of Florida and build applied AI systems, with a focus on document intelligence, retrieval, and evaluation. I contribute to open source and write technical notes about what I learn. I’m also a classical pianist, and I share performances and writing about music here.'
		THEN 'I study computer science at the University of Florida and build applied AI systems, with a focus on document intelligence, retrieval, and evaluation. I write technical notes about what I learn. I’m also a classical pianist, and I share performances and writing about music here.'
		ELSE "about_markdown"
	END,
	"updated_at" = now(),
	"version" = "version" + 1
WHERE "singleton_key" = 'default'
	AND (
		"headline" = 'Software Engineer, Applied AI'
		OR "intro_markdown" = 'I’m an AI engineer currently building applied AI systems in healthcare. I share projects, open-source work, and technical notes, alongside classical piano performances and writing about music.'
		OR "about_markdown" = 'I study computer science at the University of Florida and build applied AI systems, with a focus on document intelligence, retrieval, and evaluation. I contribute to open source and write technical notes about what I learn. I’m also a classical pianist, and I share performances and writing about music here.'
	);
