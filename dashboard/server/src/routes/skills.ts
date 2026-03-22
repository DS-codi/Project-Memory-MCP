import { Router } from 'express';
import { listSkillsFromDb, getSkillFromDb, updateSkillInDb } from '../db/queries.js';

export const skillsRouter = Router();

// GET /api/skills/db - List all skill definitions from the MCP database
skillsRouter.get('/db', (_req, res) => {
  try {
    const rows = listSkillsFromDb();
    res.json({ skills: rows, total: rows.length });
  } catch (error) {
    console.error('Error listing skills from DB:', error);
    res.status(500).json({ error: 'Failed to list skills from database' });
  }
});

// GET /api/skills/db/:name - Get a single skill from the database
skillsRouter.get('/db/:name', (req, res) => {
  try {
    const row = getSkillFromDb(req.params.name);
    if (!row) {
      return res.status(404).json({ error: `Skill '${req.params.name}' not found in database` });
    }
    res.json({ skill: row });
  } catch (error) {
    console.error('Error getting skill from DB:', error);
    res.status(500).json({ error: 'Failed to get skill from database' });
  }
});

// PUT /api/skills/db/:name - Update a skill in the database
skillsRouter.put('/db/:name', (req, res) => {
  try {
    const { content, description } = req.body;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required and must be a string' });
    }
    updateSkillInDb(req.params.name, content, description);
    res.json({ success: true, name: req.params.name });
  } catch (error) {
    console.error('Error updating skill in DB:', error);
    res.status(500).json({ error: 'Failed to update skill in database' });
  }
});
