const { format, startOfWeek, endOfWeek, subDays, subMonths, startOfMonth, endOfMonth, startOfYear, endOfYear, subYears, differenceInDays } = require('date-fns');

function getDateRange(filter) {
    const today = new Date();
    let startDate, endDate;
  
    switch (filter) {
      case 'Today':
        startDate = endDate = format(today, 'yyyy-MM-dd');
        break;
      case 'Yesterday':
        const yesterday = subDays(today, 1);
        startDate = endDate = format(yesterday, 'yyyy-MM-dd');
        break;
      case 'This week':
        startDate = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        endDate = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        break;
      case 'Last week':
        const lastWeekStart = startOfWeek(subDays(today, 7), { weekStartsOn: 1 });
        const lastWeekEnd = endOfWeek(subDays(today, 7), { weekStartsOn: 1 });
        startDate = format(lastWeekStart, 'yyyy-MM-dd');
        endDate = format(lastWeekEnd, 'yyyy-MM-dd');
        break;
      case 'Last 7 days':
        startDate = format(subDays(today, 6), 'yyyy-MM-dd');
        endDate = format(today, 'yyyy-MM-dd');
        break;
      case 'Last 14 days':
        startDate = format(subDays(today, 13), 'yyyy-MM-dd');
        endDate = format(today, 'yyyy-MM-dd');
        break;
      case 'Last 28 days':
        startDate = format(subDays(today, 27), 'yyyy-MM-dd');
        endDate = format(today, 'yyyy-MM-dd');
        break;
      case 'Last 30 days':
        startDate = format(subDays(today, 29), 'yyyy-MM-dd');
        endDate = format(today, 'yyyy-MM-dd');
        break;
      case 'Last 60 days':
        startDate = format(subDays(today, 59), 'yyyy-MM-dd');
        endDate = format(today, 'yyyy-MM-dd');
        break;
      case 'Last 90 days':
        startDate = format(subDays(today, 89), 'yyyy-MM-dd');
        endDate = format(today, 'yyyy-MM-dd');
        break;
      case 'Last 12 Month':
        startDate = format(subMonths(today, 12), 'yyyy-MM-dd');
        endDate = format(today, 'yyyy-MM-dd');
        break;
      case 'This Year':
        startDate = format(startOfYear(today), 'yyyy-MM-dd');
        endDate = format(today, 'yyyy-MM-dd');
        break;
      case 'Last Year':
        const lastYear = subYears(today, 1);
        startDate = format(startOfYear(lastYear), 'yyyy-MM-dd');
        endDate = format(endOfYear(lastYear), 'yyyy-MM-dd');
        break;
      default:
        // fallback to last 30 days
        startDate = format(subDays(today, 29), 'yyyy-MM-dd');
        endDate = format(today, 'yyyy-MM-dd');
    }
  
    const daysDiff = differenceInDays(new Date(endDate), new Date(startDate));
    let selectDate;

    if (daysDiff > 1095) { // > 3 years
      selectDate = `DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+08:00'), '%Y-01-01')`;
    } else if (daysDiff > 180) { // > 6 months
      selectDate = `DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+08:00'), '%Y-%m-01')`;
    } else if (daysDiff > 31) { // > 1 month
      selectDate = `STR_TO_DATE(CONCAT(YEAR(CONVERT_TZ(created_at, '+00:00', '+08:00')), '-', WEEK(CONVERT_TZ(created_at, '+00:00', '+08:00')), '-1'), '%X-%V-%w')`;
    } else {
      selectDate = `DATE(CONVERT_TZ(created_at, '+00:00', '+08:00'))`;
    }
  
    return { startDate, endDate };
  }

  module.exports = {getDateRange}