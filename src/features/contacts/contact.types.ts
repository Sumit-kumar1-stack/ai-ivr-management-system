export interface ContactDTO {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  company?: string;
  language: string;
  status:
    | "PENDING"
    | "CALLED"
    | "ANSWERED"
    | "FAILED"
    | "BLOCKED";
  notes?: string;
  createdAt: string;
}