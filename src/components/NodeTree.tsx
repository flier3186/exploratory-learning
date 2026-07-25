import { memo } from 'react'
import { ROLE_META } from '../constants'
import type { LearningNode } from '../types'
import { isReviewDue } from '../spaced-repetition'

function getPathSet(nodes: Record<string, LearningNode>, nodeId: string | null): Set<string> {
  const set = new Set<string>()
  let cursor: string | null = nodeId
  const guard = new Set<string>()
  while (cursor && nodes[cursor] && !guard.has(cursor)) {
    guard.add(cursor)
    set.add(cursor)
    cursor = nodes[cursor].parent_id
  }
  return set
}

export const NodeTree = memo(function NodeTree(props: {
  nodes: Record<string, LearningNode>
  topicId: string
  selectedNodeId: string | null
  onSelect: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
}) {
  const roots = Object.values(props.nodes)
    .filter((node) => node.topic_id === props.topicId && !node.parent_id)
    .sort((a, b) => a.created_at - b.created_at)

  if (!roots.length) return <p className="empty">这个主题还没有节点。</p>

  const selectedPath = getPathSet(props.nodes, props.selectedNodeId)

  return (
    <div className="node-tree">
      {roots.map((node) => (
        <TreeItem
          key={node.id}
          node={node}
          nodes={props.nodes}
          selectedNodeId={props.selectedNodeId}
          selectedPath={selectedPath}
          onSelect={props.onSelect}
          onDeleteNode={props.onDeleteNode}
          depth={0}
        />
      ))}
    </div>
  )
})

const TreeItem = memo(function TreeItem(props: {
  node: LearningNode
  nodes: Record<string, LearningNode>
  selectedNodeId: string | null
  selectedPath: Set<string>
  onSelect: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
  depth: number
}) {
  const children = props.node.links.children_ids.map((id) => props.nodes[id]).filter(Boolean)
  const meta = ROLE_META[props.node.learning_role]
  const isActive = props.selectedNodeId === props.node.id
  const isOnPath = props.selectedPath.has(props.node.id)
  const isPending = props.node.quality.generation_status === 'pending'
  const isDue = props.node.mastery.is_visited && isReviewDue(props.node.mastery.next_review_at, Date.now())
  const followupCount = props.node.followups.length
  const exploredCount = children.length

  let nodeClass = 'tree-node'
  if (isActive) nodeClass += ' active'
  if (isOnPath) nodeClass += ' on-path'
  if (isPending) nodeClass += ' pending'
  if (isDue) nodeClass += ' review-due'

  return (
    <div className={props.depth === 0 ? 'tree-branch root-branch' : 'tree-branch'}>
      {props.depth > 0 && (
        <svg className="tree-link" viewBox="0 0 24 28" aria-hidden="true">
          <path d="M2 0 V18 Q2 26 10 26 H24" />
        </svg>
      )}
      <button
        className={nodeClass}
        style={{ marginLeft: `${props.depth * 18}px` }}
        onClick={() => props.onSelect(props.node.id)}
        title={isDue ? '该复习了' : props.node.question}
      >
        <span className={`role-dot ${meta.tone}`} />
        <span className="tree-title">{props.node.short_title}</span>
        <small>{meta.label}</small>
        {followupCount > 0 && (
          <span className="explore-badge" title={`已探索 ${exploredCount}/${followupCount} 个方向`}>
            {exploredCount}/{followupCount}
          </span>
        )}
        <span className="tree-node-actions">
          <button
            className="node-delete-btn"
            title="删除此节点"
            onClick={(event) => {
              event.stopPropagation()
              props.onDeleteNode(props.node.id)
            }}
          >
            ×
          </button>
        </span>
      </button>
      {children.map((child) => (
        <TreeItem
          key={child.id}
          node={child}
          nodes={props.nodes}
          selectedNodeId={props.selectedNodeId}
          selectedPath={props.selectedPath}
          onSelect={props.onSelect}
          onDeleteNode={props.onDeleteNode}
          depth={props.depth + 1}
        />
      ))}
    </div>
  )
})
