import { z } from 'zod';

export const imageMetadataSchema = z.object({
  camera: z.string().min(1).max(120).optional(),
  lens: z.string().min(1).max(120).optional(),
  focalLength: z.number().positive().max(2000).optional(),
  aperture: z.string().regex(/^f\/\d+(\.\d+)?$/).optional(),
  shutterSpeed: z.string().max(40).optional(),
  iso: z.number().int().positive().max(204800).optional(),
  filmStock: z.string().max(80).optional(),
  isBlackAndWhite: z.boolean().optional(),
  scanResolution: z.string().max(80).optional(),
});

export const imageSchema = z.object({
  id: z.string().uuid().optional(),
  r2Key: z.string().min(1),
  thumbnailKey: z.string().min(1),
  originalName: z.string().min(1),
  size: z.number().int().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  metadata: imageMetadataSchema.optional(),
});

const submissionCoreSchema = z.object({
  issueId: z.number().int().positive(),
  title: z.string().min(1).max(120),
  authorName: z.string().max(120).optional(),
  authorContact: z.string().max(160).optional(),
  location: z.string().max(160).optional(),
  shotAt: z.string().max(32).optional(),
  equipment: z.string().max(160).optional(),
  description: z.string().max(2000).optional(),
  images: z.array(imageSchema).min(1),
});

export const submissionSchema = submissionCoreSchema.extend({
  portalToken: z.string().min(8).optional(),
});

export const issueSchema = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(120),
  guidance: z.string().min(1).max(100),
  summary: z.string().max(400).optional(),
  publishAt: z.string().datetime({ offset: true }).optional(),
  submissionDeadline: z.string().datetime({ offset: true }).optional(),
});

export const reviewDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'needs-revision']),
  notes: z.string().max(1000).optional(),
});

export const publishIssueSchema = z.object({
  status: z.enum(['draft', 'scheduled', 'published']),
  publishAt: z.string().datetime({ offset: true }).optional(),
});

export type SubmissionRequestInput = z.infer<typeof submissionSchema>;
export type SubmissionInput = z.infer<typeof submissionCoreSchema>;
export type IssueInput = z.infer<typeof issueSchema>;
export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;
export type PublishIssueInput = z.infer<typeof publishIssueSchema>;
export type ImageInput = z.infer<typeof imageSchema>;
export type ImageMetadataInput = z.infer<typeof imageMetadataSchema>;
