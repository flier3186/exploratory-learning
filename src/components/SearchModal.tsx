import { ROLE_META } from '../constants'
import type { LearningRole, SearchResult } from '../types'

export function SearchModal(props: {
  searchQuery: string
  roleFilter: LearningRole | 'all'
  tagCloud: Array<[string, number]>
  searchResults: SearchResult[]
  onClose: () => void
  onSearchQueryChange: (query: string) => void
  onRoleFilterChange: (role: LearningRole | 'all') => void
  onOpenNode: (nodeId: string) => void
}) {
  const { searchQuery, roleFilter, tagCloud, searchResults, onClose, onSearchQueryChange, onRoleFilterChange, onOpenNode } = props

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal search-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>知识找回</h2>
          <button onClick={onClose}>关闭</button>
        </div>
        <input
          autoFocus
          className="search-input"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="搜索标题、标签、问题、答案，或先用筛选找旧节点"
        />
        {tagCloud.length > 0 && (
          <div className="tag-cloud">
            <span>常用标签</span>
            {tagCloud.map(([tag, count]) => (
              <button key={tag} className={searchQuery === tag ? 'active' : ''} onClick={() => onSearchQueryChange(tag)}>
                #{tag} <small>{count}</small>
              </button>
            ))}
          </div>
        )}
        <div className="filter-row">
          <button className={roleFilter === 'all' ? 'active' : ''} onClick={() => onRoleFilterChange('all')}>
            全部
          </button>
          {Object.entries(ROLE_META).map(([role, meta]) => (
            <button
              key={role}
              className={roleFilter === role ? 'active' : ''}
              onClick={() => onRoleFilterChange(role as LearningRole)}
            >
              {meta.label}
            </button>
          ))}
        </div>
        <div className="search-results">
          {searchResults.map((result) => (
            <button
              key={result.node.id}
              className="search-result"
              onClick={() => {
                onClose()
                onOpenNode(result.node.id)
              }}
            >
              <div>
                <strong>{result.node.short_title}</strong>
                <span className={`role-chip ${ROLE_META[result.node.learning_role].tone}`}>{ROLE_META[result.node.learning_role].label}</span>
              </div>
              <p>{result.matched}</p>
              <small>{result.path}</small>
              <div className="tag-row">
                {result.node.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            </button>
          ))}
          {!searchResults.length && (
            <p className="empty">{searchQuery.trim() ? `没有找到与"${searchQuery.trim()}"相关的节点。` : '还没学过任何东西，先去问一个真实问题吧。'}</p>
          )}
        </div>
      </div>
    </div>
  )
}
