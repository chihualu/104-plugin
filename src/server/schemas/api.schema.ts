import { z } from 'zod';

export const LineUserIdSchema = z.string().min(1);
export const GroupUBINoSchema = z.string().min(1);
export const CompanyIDSchema = z.string().min(1);
export const EmpIdSchema = z.string().min(1);
export const PasswordSchema = z.string().min(1);

// New Schemas for Query Parameters
export const YearSchema = z.string().regex(/^\d{4}$/, "Invalid year format (YYYY)");
export const MonthSchema = z.string().regex(/^\d{1,2}$/, "Invalid month format");
export const SalaryIdSchema = z.string().min(1, "ID cannot be empty");

export const BindRequestSchema = z.object({
  lineUserId: LineUserIdSchema,
  groupUBINo: GroupUBINoSchema,
  companyID: CompanyIDSchema,
  empId: EmpIdSchema,
  password: PasswordSchema
});

export const LoginRequestSchema = z.object({
    lineUserId: LineUserIdSchema
});

export const CheckInRequestSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format YYYY-MM-DD")),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format HH:mm").optional(),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format HH:mm").optional(),
  reason: z.string().optional()
});

export const CheckInNowRequestSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  address: z.string().optional()
});

export const SalaryVerifySchema = z.object({
  code: z.string().min(1)
});

export const ApproveRequestSchema = z.object({
  approvalKeys: z.array(z.string().min(1))
});
