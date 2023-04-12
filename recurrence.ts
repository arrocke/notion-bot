import {
  add,
  set,
  startOfMonth,
  startOfWeek,
  startOfYear,
  getDaysInYear,
  differenceInDays,
  startOfToday,
  startOfDay
} from "date-fns";

const RECURRENCE_MATCH = /^every(?: (other|\d+))? (\w+)(?: on (\w+) (\d+))?$/i;

const monthMap: { [month: string]: number } = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11
};

const dayMap: { [day: string]: number } = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

export function parseRecurrence(str: string) {
  const match = RECURRENCE_MATCH.exec(str);
  let intervalAmount = 1;
  if (match) {
    if (match[1]) {
      switch (match[1].toLowerCase()) {
        case "other": {
          intervalAmount = 2;
          break;
        }
        default: {
          intervalAmount = parseInt(match[1]);
          if (isNaN(intervalAmount)) {
            throw new Error(`unrecognized recurrence string: ${str}`);
          }
          break;
        }
      }
    }

    let interval: {
      type: "days" | "weeks" | "months" | "years";
      amount: number;
    };
    let internal:
      | { type: "days"; amount: number }
      | { type: "date"; month: string; day: number }
      | undefined

    switch (match[2].toLowerCase()) {
      case "day":
      case "days": {
        interval = { type: "days", amount: intervalAmount };
        break;
      }
      case "week":
      case "weeks": {
        interval = { type: "weeks", amount: intervalAmount };
        break;
      }
      case "month":
      case "months": {
        interval = { type: "months", amount: intervalAmount };
        break;
      }
      case "year":
      case "years": {
        interval = { type: "years", amount: intervalAmount };
        break;
      }
      case "monday":
      case "tuesday":
      case "wednesday":
      case "thursday":
      case "friday":
      case "saturday":
      case "sunday": {
        interval = { type: "weeks", amount: intervalAmount };
        internal = { type: "days", amount: dayMap[match[2].toLowerCase()] };
        break;
      }
      default: {
        throw new Error(`unrecognized recurrence string: ${str}`);
      }
    }

    if (match[3]) {
      if (internal) {
        throw new Error(`unrecognized recurrence string: ${str}`);
      }

      const amount = parseInt(match[4]);
      if (isNaN(amount)) {
        throw new Error(`unrecognized recurrence string: ${str}`);
      }

      switch (match[3].toLowerCase()) {
        case "day": {
          internal = { type: "days", amount: amount };
          break;
        }
        case "january":
        case "february":
        case "march":
        case "april":
        case "may":
        case "june":
        case "july":
        case "august":
        case "september":
        case "october":
        case "november":
        case "december": {
          internal = {
            type: "date",
            month: match[3].toLowerCase(),
            day: amount
          };
          break;
        }
        default: {
          throw new Error(`unrecognized recurrence string: ${str}`);
        }
      }
    }

    return { interval, internal: internal ?? { type: "days", amount: 1 } };
  } else {
    throw new Error(`unrecognized recurrence string: ${str}`);
  }
}

// TODO: jump forward recurrences until in the future.
export function nextRecurrence(date: Date, recurrence: string) {
  const { interval, internal } = parseRecurrence(recurrence);

  function nextRecurrenceIteration(date: Date) {
    let refDate = date;
    switch (internal.type) {
      case "days": {
        switch (interval.type) {
          case "weeks": {
            if (internal.amount <= date.getDay()) refDate = date;
            else refDate = add(date, { days: -7 });
            break;
          }
          case "months": {
            if (internal.amount <= date.getDate()) refDate = date;
            else refDate = add(date, { months: -1 });
            break;
          }
          case "years": {
            if (internal.amount <= getDaysInYear(date)) refDate = date;
            else refDate = add(date, { years: -1 });
            break;
          }
        }
        break;
      }
      case "date": {
        if (interval.type !== "years") {
          throw new Error(`unrecognized recurrence string: ${recurrence}`);
        }

        const month = monthMap[internal.month]
        if (month < date.getMonth() || (month === date.getMonth() && internal.day <= date.getDate())) {
          refDate = date
        } else {
          refDate = add(date, { years: - 1})
        }
        break
      }
    }

    const nextInterval = add(refDate, { [interval.type]: interval.amount });

    switch (internal.type) {
      case "days": {
        switch (interval.type) {
          case "days": {
            return startOfDay(nextInterval)
          }
          case "weeks": {
            return add(startOfWeek(nextInterval), {
              days: internal.amount
            });
          }
          case "months": {
            return add(startOfMonth(nextInterval), {
              days: internal.amount - 1
            });
          }
          case "years": {
            return add(startOfYear(nextInterval), {
              days: internal.amount - 1
            });
          }
          default: {
            throw new Error(`unrecognized recurrence string: ${recurrence}`);
          }
        }
      }
      case "date": {
        return set(startOfDay(nextInterval), {
          month: monthMap[internal.month],
          date: internal.day
        });
      }
    }
  }

  let nextDate = date
  const now = startOfToday()
  while (differenceInDays(now, nextDate) >= 0) {
    nextDate = nextRecurrenceIteration(nextDate)
  }

  return nextDate
}
