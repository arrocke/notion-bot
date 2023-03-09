import { nextRecurrence } from '@/recurrence'
import { isFullPage } from '@notionhq/client'
import { iteratePaginatedAPI } from '@notionhq/client'
import { add, endOfWeek, format, differenceInDays } from 'date-fns'
import type { NextApiRequest, NextApiResponse } from 'next'
import notion from '../../../notion-client'

async function processRecurringTasks(databaseId: string) {
  for await (const page of iteratePaginatedAPI(notion.databases.query, {
    database_id: databaseId,
    filter: {
      and: [
        {
          property: 'Recurrence',
          rich_text: {
            is_not_empty: true as const
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

      const startDate = dateProperty.date ? new Date(dateProperty.date.start) : new Date()
      const endDate = dateProperty.date?.end ? new Date(dateProperty.date.end) : undefined
      const diff = endDate ? differenceInDays(endDate, startDate) : 0

      const newStartDate = nextRecurrence(startDate, recurrence)
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

async function processUpcomingTasks(databaseId: string) {
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ error: string } | undefined>
) {
  const databaseId = req.body.databaseId
  if (!databaseId) {
    return res.status(422).json({
      error: 'databaseId required'
    })
  }

  await processRecurringTasks(databaseId)
  await processUpcomingTasks(databaseId)

  res.status(204).end()
}
