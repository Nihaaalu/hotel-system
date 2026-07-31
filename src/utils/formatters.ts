export const getISTDateStr = (): string => {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date()); // Returns YYYY-MM-DD in Asia/Kolkata
  } catch {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + istOffset);
    return istDate.toISOString().substring(0, 10);
  }
};

export const getISTMonthStr = (): string => getISTDateStr().substring(0, 7);

export const getISTDate = (): Date => {
  const dateStr = getISTDateStr();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const formatDateDDMMYYYY = (dateInput: string | Date | number | null | undefined): string => {
  if (!dateInput) return '';
  
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed) return '';

    // If already in DD/MM/YYYY format
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      return trimmed;
    }

    // Check YYYY-MM-DD or YYYY-MM-DDThh:mm... or YYYY/MM/DD
    const datePart = trimmed.split('T')[0].trim();
    const ymdMatch = datePart.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (ymdMatch) {
      const year = ymdMatch[1];
      const month = ymdMatch[2].padStart(2, '0');
      const day = ymdMatch[3].padStart(2, '0');
      return `${day}/${month}/${year}`;
    }
  }

  // Otherwise convert using Date
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    return String(dateInput);
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

export const formatDateHuman = (dateStr: string | null | undefined): string => {
  return formatDateDDMMYYYY(dateStr);
};

export const formatDateHumanShort = (dateStr: string | null | undefined): string => {
  return formatDateDDMMYYYY(dateStr);
};

export const formatDateTimeDDMMYYYY = (dateInput: string | Date | number | null | undefined): string => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    return formatDateDDMMYYYY(dateInput);
  }
  const dateFormatted = formatDateDDMMYYYY(d);
  const timeFormatted = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${dateFormatted} ${timeFormatted}`;
};

