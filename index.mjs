import { Client, isFullPage } from '@notionhq/client'
import { iteratePaginatedAPI } from '@notionhq/client'
import { add, endOfWeek, format, differenceInDays } from 'date-fns'
import cronParser from 'cron-parser'

const notion = new Client({
    auth: process.env.NOTION_TOKEN,
})

/**
* @param databaseId {string}
* @param tz {string}
*/
async function processRecurringTasks(databaseId, tz) {
    for await (const page of iteratePaginatedAPI(notion.databases.query, {
        database_id: databaseId,
        filter: {
            and: [
                {
                    property: 'Recurrence',
                    rich_text: {
                        is_not_empty: true
                    }
                },
                {
                    property: 'Status',
                    status: {
                        equals: 'Done'
                    }
                }
            ]
        }
    })) {
        try {
            if (!isFullPage(page)) continue

            const recurrenceProperty = page.properties['Recurrence']
            if (recurrenceProperty.type !== 'rich_text') continue
            const recurrence = recurrenceProperty.rich_text[0]?.plain_text ?? ''

            const dateProperty = page.properties['Due Date']
            if (dateProperty.type !== 'date') continue

            const interval = cronParser.parseExpression(recurrence, {
                currentDate: new Date(),
                tz
            })

            const startDate = dateProperty.date ? new Date(dateProperty.date.start) : new Date()
            const endDate = dateProperty.date?.end ? new Date(dateProperty.date.end) : undefined
            const diff = endDate ? differenceInDays(endDate, startDate) : 0

            const newStartDate = interval.next().toDate()
            const newEndDate = diff > 0 ? add(newStartDate, { days: diff }) : undefined

            await notion.pages.update({
                page_id: page.id,
                properties: {
                    'Due Date': {
                        type: 'date',
                        date: { start: format(newStartDate, 'yyyy-MM-dd'), end: newEndDate ? format(newEndDate, 'yyyy-MM-dd') : undefined }
                    },
                    'Status': {
                        type: 'status',
                        status: { name: 'Unplanned' }
                    }
                }
            })
            console.log(`Updated page ${page.id} to ${format(newStartDate, 'yyyy-MM-dd')}`)
        } catch (error) {
            console.error(`Failed to process page ${page.id}: ${error}`)
        }
    }
}

/** @param databaseId {string} */
async function processUpcomingTasks(databaseId) {
    for await (const page of iteratePaginatedAPI(notion.databases.query, {
        database_id: databaseId,
        filter: {
            and: [
                {
                    property: 'Due Date',
                    date: {
                        on_or_before: endOfWeek(new Date()).toISOString()
                    }
                },
                {
                    property: 'Status',
                    status: {
                        equals: 'Unplanned'
                    }
                }
            ]
        }
    })) {
        try {
            if (!isFullPage(page)) continue

            await notion.pages.update({
                page_id: page.id,
                properties: {
                    'Status': {
                        type: 'status',
                        status: { name: 'Not started' }
                    }
                }
            })
            console.log(`Updated page ${page.id} to 'not started'`)
        } catch (error) {
            console.error(`Failed to process page ${page.id}: ${error}`)
        }
    }
}


async function run() {
    const databaseId = process.env.PROJECT_DATABASE
    const tz = process.env.CLIENT_TZ

    await processRecurringTasks(databaseId, tz)
    await processUpcomingTasks(databaseId)
}

await run()

