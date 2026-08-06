const enabled = (value, fallback = false) => value === undefined ? fallback : [true, 1, '1', 'true', 'on'].includes(value);

const text = (value, maximum = 1000) => String(value ?? '').trim().slice(0, maximum);

export function defaultFamilyAccessReviewDate(now = new Date()) {
  const review = new Date(now);
  review.setUTCFullYear(review.getUTCFullYear() + 1);
  return review.toISOString().slice(0, 10);
}

export function normaliseFamilyPortalAccess(input = {}, now = new Date()) {
  return {
    canViewProfile: enabled(input.canViewProfile, true),
    canViewVisits: enabled(input.canViewVisits, true),
    canViewCareUpdates: enabled(input.canViewCareUpdates, true),
    canViewDocuments: enabled(input.canViewDocuments, false),
    canViewMedication: enabled(input.canViewMedication, false),
    canViewCarePlan: enabled(input.canViewCarePlan, false),
    canMessageTeam: enabled(input.canMessageTeam, true),
    relationship: text(input.relationship, 120),
    accessReviewDate: text(input.accessReviewDate, 10) || defaultFamilyAccessReviewDate(now)
  };
}

export function familyAccessReviewState(value, now = new Date()) {
  if (!value) return 'missing';
  const date = new Date(`${value}T23:59:59Z`);
  if (Number.isNaN(date.getTime())) return 'missing';
  if (date.getTime() < now.getTime()) return 'overdue';
  const days = Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
  if (days <= 30) return 'due_soon';
  return 'current';
}

export function normaliseFamilyPreferences(input = {}) {
  const digest = ['immediate', 'daily', 'weekly', 'none'].includes(String(input.digestFrequency || '').toLowerCase())
    ? String(input.digestFrequency).toLowerCase()
    : 'immediate';
  return {
    inAppNotifications: enabled(input.inAppNotifications, true),
    emailNotifications: enabled(input.emailNotifications, true),
    visitNotifications: enabled(input.visitNotifications, true),
    careUpdateNotifications: enabled(input.careUpdateNotifications, true),
    documentNotifications: enabled(input.documentNotifications, true),
    messageNotifications: enabled(input.messageNotifications, true),
    digestFrequency: digest
  };
}

export function validateFamilyMessage(input = {}) {
  const body = text(input.message, 4000);
  const subject = text(input.subject, 160);
  const category = ['general', 'care', 'visits', 'medication', 'documents'].includes(String(input.category || '').toLowerCase())
    ? String(input.category).toLowerCase()
    : 'general';
  const priority = ['normal', 'important'].includes(String(input.priority || '').toLowerCase())
    ? String(input.priority).toLowerCase()
    : 'normal';
  if (body.length < 2) return { error: 'Enter a message for the care team.' };
  if (!input.threadId && subject.length < 3) return { error: 'Enter a clear subject for the conversation.' };
  return { value: { body, subject, category, priority } };
}

export function validateFamilyUpdate(input = {}) {
  const title = text(input.title, 160);
  const summary = text(input.summary, 4000);
  const category = ['care', 'wellbeing', 'activity', 'visit', 'general'].includes(String(input.category || '').toLowerCase())
    ? String(input.category).toLowerCase()
    : 'care';
  const mood = ['not_recorded', 'settled', 'positive', 'low', 'mixed'].includes(String(input.mood || '').toLowerCase())
    ? String(input.mood).toLowerCase()
    : 'not_recorded';
  if (title.length < 3 || summary.length < 8) return { error: 'Add a clear title and family-safe update of at least 8 characters.' };
  return { value: { title, summary, category, mood } };
}
