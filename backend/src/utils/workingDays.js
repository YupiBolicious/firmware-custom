const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
const addWorkingDays = (assignedAt, days) => {
  const d = new Date(assignedAt.getFullYear(), assignedAt.getMonth(), assignedAt.getDate());
  for (let i = 0; i < days; i++) {
    do { d.setDate(d.getDate() + 1); } while (isWeekend(d));
  }
  if (days === 0) while (isWeekend(d)) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const calculateEta = (assignedAt, totalHours) =>
  addWorkingDays(assignedAt, Math.ceil(Number(totalHours) / 8));

module.exports = {
    addWorkingDays, calculateEta,   
};