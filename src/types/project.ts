export interface SessionInfo {
  name: string
  mode: 'worktree' | 'project'
  port?: number
  startTime?: string
}

export interface ProjectInfo {
  name: string
  path: string
  projectType?: 'nextjs' | 'commanderjs' | 'unknown'
  git?: {
    branch: string
    commit: string
    status: 'clean' | 'dirty'
  }
  files?: {
    dotGit: boolean
    packageJson: boolean
    tmuxComposerConfig: boolean
  }
  latestCommit?: string
  latestChat?: string
  hasReleaseScript: boolean
  lastReleaseVersion?: string
  commitsSinceLastRelease?: number
  isGitRepositoryClean: boolean
  activeSessions?: SessionInfo[]
  isProjectsPath: boolean
}

export interface ProjectsMap {
  [key: string]: {
    project: ProjectInfo
    config: Record<string, any>
  }
}
