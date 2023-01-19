import { nextRecurrence } from '@/recurrence'
import { isFullPage } from '@notionhq/client'
import { iteratePaginatedAPI } from '@notionhq/client'
import { add, format, isBefore } from 'date-fns'
import type { NextApiRequest, NextApiResponse } from 'next'
import notion from '../../notion-client'


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

      const dueDateProperty = page.properties['Due Date']
      if (dueDateProperty.type !== 'date') continue
      const dueDate = dueDateProperty.date ? new Date(dueDateProperty.date.start) : new Date()

      const newDueDate = nextRecurrence(dueDate, recurrence)
      const isWithinWeek = isBefore(newDueDate, add(new Date(), { days: 7 }))
      await notion.pages.update({
        page_id: page.id,
        properties: {
          'Due Date': {
            type: 'date',
            date: { start: format(newDueDate, 'yyyy-MM-dd') }
          },
          'Status': {
            type: 'status',
            status: { name: isWithinWeek ? 'Not started' : 'Unplanned' }
          }
        }
      })
      console.log(`Updated page ${page.id} to ${format(newDueDate, 'yyyy-MM-dd')}`)
    } catch (error) {
      console.error(`Failed to process page ${page.id}: ${error}`)
    }
  }

  res.status(204).end()
}
