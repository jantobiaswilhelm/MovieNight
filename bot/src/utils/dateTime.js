/**
 * Parse a human-readable date/time string into a Date object.
 *
 * Supported formats:
 *  - ISO 8601 and anything `new Date()` understands natively
 *  - Day names: "Saturday 8pm", "friday 20:00"
 *  - "tomorrow 8pm", "today 20:00"
 *  - "YYYY-MM-DD HH:MM" with optional am/pm
 *
 * @param {string} str - The date/time string to parse
 * @returns {Date}
 */
export function parseDateTime(str) {
  // Try ISO format first
  let date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date;
  }

  const now = new Date();

  // Handle day names
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const lowerStr = str.toLowerCase();

  for (let i = 0; i < days.length; i++) {
    if (lowerStr.includes(days[i])) {
      date = new Date(now);
      const currentDay = date.getDay();
      let daysUntil = i - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      date.setDate(date.getDate() + daysUntil);

      // Extract time if present
      const timeMatch = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]) || 0;
        const period = timeMatch[3];

        if (period?.toLowerCase() === 'pm' && hours < 12) hours += 12;
        if (period?.toLowerCase() === 'am' && hours === 12) hours = 0;

        date.setHours(hours, minutes, 0, 0);
      }
      return date;
    }
  }

  // Handle "tomorrow" keyword
  if (lowerStr.includes('tomorrow')) {
    date = new Date(now);
    date.setDate(date.getDate() + 1);

    const timeMatch = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]) || 0;
      const period = timeMatch[3];

      if (period?.toLowerCase() === 'pm' && hours < 12) hours += 12;
      if (period?.toLowerCase() === 'am' && hours === 12) hours = 0;

      date.setHours(hours, minutes, 0, 0);
    }
    return date;
  }

  // Handle "today" keyword
  if (lowerStr.includes('today')) {
    date = new Date(now);

    const timeMatch = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]) || 0;
      const period = timeMatch[3];

      if (period?.toLowerCase() === 'pm' && hours < 12) hours += 12;
      if (period?.toLowerCase() === 'am' && hours === 12) hours = 0;

      date.setHours(hours, minutes, 0, 0);
    }
    return date;
  }

  // Try parsing as "YYYY-MM-DD HH:MM" or similar
  const parts = str.split(/[\s,]+/);
  if (parts.length >= 2) {
    const datePart = parts[0];
    const timePart = parts.slice(1).join(' ');

    date = new Date(datePart);

    const timeMatch = timePart.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch && !isNaN(date.getTime())) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]) || 0;
      const period = timeMatch[3];

      if (period?.toLowerCase() === 'pm' && hours < 12) hours += 12;
      if (period?.toLowerCase() === 'am' && hours === 12) hours = 0;

      date.setHours(hours, minutes, 0, 0);
      return date;
    }
  }

  return new Date(str);
}
