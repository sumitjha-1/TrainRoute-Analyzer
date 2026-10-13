/**
 * @typedef {Object} RouteStation
 * @property {string} stationCode
 * @property {string} stationName
 * @property {number} distance   // cumulative km from origin
 * @property {number} order      // index along the route, 0-based
 */

/**
 * @typedef {Object} ScheduleStop
 * @property {string} stationCode
 * @property {string} arrivalRaw     // "HH:MM" as read from file, may be null for origin
 * @property {string} departureRaw   // "HH:MM" as read from file, may be null for terminus
 * @property {{hh:number,mm:number}|null} arrivalClock
 * @property {{hh:number,mm:number}|null} departureClock
 * @property {number|null} arrivalDay
 * @property {number|null} departureDay
 * @property {number|null} arrivalAbs    // absolute minutes (day*1440 + hh*60+mm)
 * @property {number|null} departureAbs
 * @property {number|null} distance      // resolved from route file
 * @property {boolean} isHaltInvalid     // arrival > departure at same station
 * @property {number} [stoppageTime]     // from MANSTPGTIME (seconds), if present
 * @property {number} [continuousStoppageTime] // from MANCSTPGTIME (seconds), if present
 * @property {string} [prevBlock]
 * @property {string} [prevBlockLine]
 * @property {string} [nextBlock]
 * @property {string} [nextBlockLine]
 */

/**
 * @typedef {Object} Train
 * @property {string} trainNumber
 * @property {string} trainName
 * @property {string} color        // assigned display color
 * @property {string} dashPattern  // svg stroke-dasharray, secondary distinguishing channel
 * @property {ScheduleStop[]} stops
 * @property {number} maxDay
 */

/**
 * @typedef {Object} ValidationIssue
 * @property {'error'|'warning'} level
 * @property {string} message
 * @property {string} [source]     // 'route' | 'schedule'
 * @property {string} [trainNumber]
 * @property {string} [stationCode]
 * @property {number} [rowNumber]
 */

export {};