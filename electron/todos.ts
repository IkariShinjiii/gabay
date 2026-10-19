import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { writeJsonAtomic } from './atomicWrite'
import { join } from 'node:path'

export interface Todo {
  id: string
  text: string
  done: boolean
}

const MAX_TODOS = 100
const MAX_CHARS = 200

let todos: Todo[] | null = null

const storePath = (): string => join(app.getPath('userData'), 'todos.json')

async function load(): Promise<Todo[]> {
  if (todos) return todos
  try {
    const raw = JSON.parse(await readFile(storePath(), 'utf8')) as Partial<Todo>[]
    todos = raw.flatMap((r) =>
      typeof r.id === 'string' && typeof r.text === 'string' && typeof r.done === 'boolean'
        ? [{ id: r.id, text: r.text.slice(0, MAX_CHARS), done: r.done }]
        : []
    )
  } catch {
    todos = []
  }
  return todos
}

async function save(): Promise<void> {
  await writeJsonAtomic(storePath(), todos ?? [])
}

export async function listTodos(): Promise<Todo[]> {
  return [...(await load())]
}

export async function addTodo(text: string): Promise<Todo[]> {
  const list = await load()
  const clean = text.trim().slice(0, MAX_CHARS)
  if (clean && list.length < MAX_TODOS) {
    list.unshift({ id: randomUUID(), text: clean, done: false })
    await save()
  }
  return [...list]
}

export async function toggleTodo(id: string): Promise<Todo[]> {
  const list = await load()
  const t = list.find((x) => x.id === id)
  if (t) {
    t.done = !t.done
    await save()
  }
  return [...list]
}

export async function removeTodo(id: string): Promise<Todo[]> {
  const list = await load()
  const i = list.findIndex((x) => x.id === id)
  if (i >= 0) {
    list.splice(i, 1)
    await save()
  }
  return [...list]
}
