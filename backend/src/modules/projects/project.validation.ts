import { z } from 'zod';
import { ValidationError } from '../../core/errors/app-error';

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date format YYYY-MM-DD');

const projectInfoSchema = z
  .object({
    name: z.string().trim().min(1, 'Project name is required'),
    description: z.string().trim().min(1, 'Project description is required'),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    start_date: dateSchema.optional(),
    end_date: dateSchema.optional()
  })
  .superRefine((value, ctx) => {
    const startDate = value.startDate ?? value.start_date;
    const endDate = value.endDate ?? value.end_date;

    if (!startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startDate is required',
        path: ['startDate']
      });
    }

    if (!endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endDate is required',
        path: ['endDate']
      });
    }

    if (startDate && endDate && endDate < startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endDate must be greater than or equal to startDate',
        path: ['endDate']
      });
    }
  })
  .transform((value) => ({
    name: value.name,
    description: value.description,
    startDate: value.startDate ?? value.start_date ?? '',
    endDate: value.endDate ?? value.end_date ?? ''
  }));

const existingUserSelectorSchema = z.object({
  mode: z.literal('existing'),
  userId: z.number().int().positive('userId must be a positive integer')
});

const createTechOwnerSchema = z.object({
  mode: z.literal('create'),
  name: z.string().trim().min(2, 'Technical responsible name is required'),
  email: z.string().email('Technical responsible email must be valid'),
  password: z.string().min(8, 'Technical responsible password must have at least 8 characters')
});

const createClientOwnerSchema = z.object({
  mode: z.literal('create'),
  name: z.string().trim().min(2, 'Stakeholder name is required'),
  email: z.string().email('Stakeholder email must be valid'),
  company: z.string().trim().min(2, 'Stakeholder company is required'),
  roleName: z.string().trim().min(2, 'Stakeholder roleName is required').optional(),
  role: z.string().trim().min(2, 'Stakeholder role is required').optional()
});

export const createProjectWithMembersSchema = z.object({
  project: projectInfoSchema,
  techOwner: z.discriminatedUnion('mode', [existingUserSelectorSchema, createTechOwnerSchema]),
  clientOwner: z.discriminatedUnion('mode', [existingUserSelectorSchema, createClientOwnerSchema])
});

export type CreateProjectWithMembersInput = z.infer<typeof createProjectWithMembersSchema>;

export const validateCreateProjectWithMembers = (payload: unknown): CreateProjectWithMembersInput => {
  const parsed = createProjectWithMembersSchema.safeParse(payload);
  if (!parsed.success) {
    throw ValidationError.fromZod(parsed.error);
  }
  return parsed.data;
};
