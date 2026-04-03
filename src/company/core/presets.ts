// ─── Preset Registry ──────────────────────────────────────────────────────────
// Maps AgentPreset string → full PresetInfo for persona generation & UI.

import type { AgentPreset } from '../types';

export interface PresetInfo {
  id: AgentPreset;
  name: string;
  description: string;
  category: string;
  icon: string;
  tools: string[];
  isLeadCapable: boolean;
}

const PRESETS: Record<AgentPreset, PresetInfo> = {
  // Engineering
  'software-architect': { id: 'software-architect', name: 'Software Architect', description: 'System design, architectural patterns, and technical decision-making', category: 'Engineering', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: true },
  'backend-architect': { id: 'backend-architect', name: 'Backend Architect', description: 'Server-side APIs, microservices, and scalable backend systems', category: 'Engineering', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: true },
  'frontend-developer': { id: 'frontend-developer', name: 'Frontend Developer', description: 'React, Vue, Angular, UI implementation, and performance optimization', category: 'Engineering', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: false },
  'senior-developer': { id: 'senior-developer', name: 'Senior Developer', description: 'Full-stack implementation with advanced patterns', category: 'Engineering', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: true },
  'ai-engineer': { id: 'ai-engineer', name: 'AI Engineer', description: 'ML model development, deployment, and AI system integration', category: 'Engineering', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: false },
  'data-engineer': { id: 'data-engineer', name: 'Data Engineer', description: 'Data pipelines, ETL/ELT, and data infrastructure', category: 'Engineering', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: false },
  'database-optimizer': { id: 'database-optimizer', name: 'Database Optimizer', description: 'Query optimization, schema design, and performance tuning', category: 'Engineering', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: false },
  'devops-automator': { id: 'devops-automator', name: 'DevOps Automator', description: 'CI/CD pipelines, infrastructure automation, and deployment', category: 'Engineering', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: false },
  'sre': { id: 'sre', name: 'Site Reliability Engineer', description: 'SLOs, observability, chaos engineering, and toil reduction', category: 'Engineering', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: false },
  'security-engineer': { id: 'security-engineer', name: 'Security Engineer', description: 'Security controls, threat modeling, and vulnerability management', category: 'Engineering', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: true },
  'code-reviewer': { id: 'code-reviewer', name: 'Code Reviewer', description: 'Code quality, security review, and best practices enforcement', category: 'Engineering', icon: '', tools: ['Read', 'Glob', 'Grep'], isLeadCapable: false },
  'technical-writer': { id: 'technical-writer', name: 'Technical Writer', description: 'API docs, tutorials, and developer documentation', category: 'Engineering', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'database-architect': { id: 'database-architect', name: 'Database Architect', description: 'Database schema design and high-availability architectures', category: 'Engineering', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: true },
  'security-auditor': { id: 'security-auditor', name: 'Security Auditor', description: 'Security audits, compliance assessments, and vulnerability analysis', category: 'Engineering', icon: '', tools: ['Read', 'Grep', 'Glob'], isLeadCapable: false },
  'test-automator': { id: 'test-automator', name: 'Test Automator', description: 'Automated test frameworks, CI/CD test integration', category: 'Engineering', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: false },
  'deployment-engineer': { id: 'deployment-engineer', name: 'Deployment Engineer', description: 'CI/CD pipelines and deployment automation', category: 'Engineering', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: false },
  'devops-engineer': { id: 'devops-engineer', name: 'DevOps Engineer', description: 'Infrastructure automation and cloud operations', category: 'Engineering', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: true },

  // Design
  'ui-designer': { id: 'ui-designer', name: 'UI Designer', description: 'Visual design systems, component libraries, and accessible interfaces', category: 'Design', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: true },
  'ux-architect': { id: 'ux-architect', name: 'UX Architect', description: 'Technical architecture with UX focus, CSS systems', category: 'Design', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: true },
  'ux-researcher': { id: 'ux-researcher', name: 'UX Researcher', description: 'User behavior analysis, usability testing, and research', category: 'Design', icon: '', tools: ['Read', 'Grep', 'Glob'], isLeadCapable: false },
  'brand-guardian': { id: 'brand-guardian', name: 'Brand Guardian', description: 'Brand identity, consistency, and strategic positioning', category: 'Design', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'visual-storyteller': { id: 'visual-storyteller', name: 'Visual Storyteller', description: 'Visual narratives, multimedia content, and brand storytelling', category: 'Design', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'image-prompt-engineer': { id: 'image-prompt-engineer', name: 'Image Prompt Engineer', description: 'AI image generation prompts and visual concepts', category: 'Design', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'design-system-architect': { id: 'design-system-architect', name: 'Design System Architect', description: 'Design systems, component libraries, and design tokens', category: 'Design', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: true },

  // Project Management
  'studio-producer': { id: 'studio-producer', name: 'Studio Producer', description: 'Multi-project portfolio management and strategic orchestration', category: 'Management', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: true },
  'project-shepherd': { id: 'project-shepherd', name: 'Project Shepherd', description: 'Cross-functional project coordination and stakeholder alignment', category: 'Management', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: true },
  'studio-operations': { id: 'studio-operations', name: 'Studio Operations', description: 'Day-to-day studio efficiency and process optimization', category: 'Management', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'senior-project-manager': { id: 'senior-project-manager', name: 'Senior Project Manager', description: 'Realistic scope, exact spec requirements, task conversion', category: 'Management', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: true },
  'experiment-tracker': { id: 'experiment-tracker', name: 'Experiment Tracker', description: 'A/B test management and data-driven experimentation', category: 'Management', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'project-manager': { id: 'project-manager', name: 'Project Manager', description: 'Project planning, risk management, and stakeholder coordination', category: 'Management', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: true },

  // Testing
  'accessibility-auditor': { id: 'accessibility-auditor', name: 'Accessibility Auditor', description: 'WCAG compliance, assistive technology testing', category: 'Testing', icon: '', tools: ['Read', 'Grep', 'Glob', 'Bash'], isLeadCapable: false },
  'api-tester': { id: 'api-tester', name: 'API Tester', description: 'API validation, performance testing, and quality assurance', category: 'Testing', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: false },
  'performance-benchmarker': { id: 'performance-benchmarker', name: 'Performance Benchmarker', description: 'Performance measurement, analysis, and optimization', category: 'Testing', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: false },
  'test-results-analyzer': { id: 'test-results-analyzer', name: 'Test Results Analyzer', description: 'Test result evaluation and quality metrics analysis', category: 'Testing', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: false },
  'workflow-optimizer': { id: 'workflow-optimizer', name: 'Workflow Optimizer', description: 'Process improvement and workflow automation', category: 'Testing', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: false },
  'reality-checker': { id: 'reality-checker', name: 'Reality Checker', description: 'Evidence-based certification, default to NEEDS WORK', category: 'Testing', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: false },

  // Sales
  'sales-coach': { id: 'sales-coach', name: 'Sales Coach', description: 'Rep development, pipeline review, and deal strategy', category: 'Sales', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: true },
  'account-strategist': { id: 'account-strategist', name: 'Account Strategist', description: 'Post-sale account strategy and net revenue retention', category: 'Sales', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'deal-strategist': { id: 'deal-strategist', name: 'Deal Strategist', description: 'MEDDPICC qualification and win planning', category: 'Sales', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'outbound-strategist': { id: 'outbound-strategist', name: 'Outbound Strategist', description: 'Multi-channel prospecting and pipeline building', category: 'Sales', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'pipeline-analyst': { id: 'pipeline-analyst', name: 'Pipeline Analyst', description: 'Pipeline health diagnostics and forecast accuracy', category: 'Sales', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'sales-engineer': { id: 'sales-engineer', name: 'Sales Engineer', description: 'Technical pre-sales, demo engineering, and POC scoping', category: 'Sales', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },

  // Marketing
  'seo-specialist': { id: 'seo-specialist', name: 'SEO Specialist', description: 'Technical SEO, content optimization, and search rankings', category: 'Marketing', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'content-creator': { id: 'content-creator', name: 'Content Creator', description: 'Multi-platform content strategy and editorial calendars', category: 'Marketing', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'growth-hacker': { id: 'growth-hacker', name: 'Growth Hacker', description: 'Rapid user acquisition and conversion funnel optimization', category: 'Marketing', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: true },
  'podcast-strategist': { id: 'podcast-strategist', name: 'Podcast Strategist', description: 'Audio content strategy and podcast operations', category: 'Marketing', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'linkedin-strategist': { id: 'linkedin-strategist', name: 'LinkedIn Strategist', description: 'LinkedIn thought leadership and professional content', category: 'Marketing', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'tiktok-strategist': { id: 'tiktok-strategist', name: 'TikTok Strategist', description: 'TikTok viral content and community building', category: 'Marketing', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'content-strategist': { id: 'content-strategist', name: 'Content Strategist', description: 'Content planning, SEO optimization, and multi-channel campaigns', category: 'Marketing', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: true },
  'social-media-manager': { id: 'social-media-manager', name: 'Social Media Manager', description: 'Cross-platform social media campaigns and community management', category: 'Marketing', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },

  // Product
  'product-manager': { id: 'product-manager', name: 'Product Manager', description: 'Product strategy, roadmap, and stakeholder alignment', category: 'Product', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: true },
  'feedback-synthesizer': { id: 'feedback-synthesizer', name: 'Feedback Synthesizer', description: 'User feedback analysis and actionable product insights', category: 'Product', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'feature-prioritizer': { id: 'feature-prioritizer', name: 'Feature Prioritizer', description: 'Sprint planning and feature prioritization frameworks', category: 'Product', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'roadmap-strategist': { id: 'roadmap-strategist', name: 'Roadmap Strategist', description: 'Product roadmap design and strategic planning', category: 'Product', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },

  // Specialized
  'agents-orchestrator': { id: 'agents-orchestrator', name: 'Agents Orchestrator', description: 'Multi-agent pipeline management and workflow coordination', category: 'Specialized', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: true },
  'workflow-architect': { id: 'workflow-architect', name: 'Workflow Architect', description: 'Workflow tree design and build-ready spec creation', category: 'Specialized', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: true },
  'mcp-builder': { id: 'mcp-builder', name: 'MCP Builder', description: 'Model Context Protocol server development', category: 'Specialized', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: false },
  'compliance-auditor': { id: 'compliance-auditor', name: 'Compliance Auditor', description: 'SOC 2, ISO 27001, HIPAA compliance audits', category: 'Specialized', icon: '', tools: ['Read', 'Grep', 'Glob'], isLeadCapable: false },
  'developer-advocate': { id: 'developer-advocate', name: 'Developer Advocate', description: 'Developer community building and platform adoption', category: 'Specialized', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },
  'recruitment-specialist': { id: 'recruitment-specialist', name: 'Recruitment Specialist', description: 'Talent acquisition and employer brand building', category: 'Specialized', icon: '', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], isLeadCapable: false },

  // Custom
  'custom': { id: 'custom', name: 'Custom Agent', description: 'Custom agent with user-defined configuration', category: 'Custom', icon: '', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], isLeadCapable: true },
};

export function getPresetInfo(preset: AgentPreset): PresetInfo {
  return PRESETS[preset] ?? PRESETS['custom'];
}

export function getAllPresets(): PresetInfo[] {
  return Object.values(PRESETS);
}

export function getPresetsByCategory(category: string): PresetInfo[] {
  return Object.values(PRESETS).filter((p) => p.category === category);
}

export function getCategories(): string[] {
  return [...new Set(Object.values(PRESETS).map((p) => p.category))];
}
