import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  ArrowUp,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Moon,
  Plus,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import {
  type CommunitySettings,
  type Confession,
  CONFESSION_TOPICS,
  type ConfessionTopic,
  DEFAULT_COMMUNITY_SETTINGS,
  type SavedPost,
  type UserProfile,
} from './types';
import {
  ensureUserAccountAndProfile,
  saveConfession,
  seedStarterConfessions,
  unsaveConfession,
} from './lib/firestoreService';
import {
  getColdStartPreviewConfessions,
  getMissingStarterPosts,
} from './lib/starterPreview';
import { matchesPostCategory } from './lib/topicClassifier';
import { ConfessionCard } from './components/ConfessionCard';
import { ComposeModal, hasSavedComposeDraft } from './components/ComposeModal';
import { ProfileModal } from './components/ProfileModal';
import { ReportModal } from './components/ReportModal';
import { ReputationView } from './components/ReputationView';
import { ModerationView } from './components/ModerationView';

type ActiveSection = 'feed' | 'saved' | 'reputation' | 'moderation';
type SortMode = 'latest' | 'top' | 'discussed';

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = window.localStorage.getItem('tys-theme');
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [activeSection, setActiveSection] = useState<ActiveSection>('feed');
  const [selectedTopic, setSelectedTopic] = useState<ConfessionTopic | 'All'>('All');
  const [sortMode, setSortMode] = useState<SortMode>('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const categoryRailRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);

  const [confessions, setConfessions] = useState<Confession[]>([]);
  const previewConfessions = useMemo(() => getColdStartPreviewConfessions(), []);
  const [loadingConfessions, setLoadingConfessions] = useState(true);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [settings, setSettings] = useState<CommunitySettings>(DEFAULT_COMMUNITY_SETTINGS);
  const [userVotes, setUserVotes] = useState<Record<string, number | null>>({});

  // User-specific Saved bookmarks (/users/{uid}/saved/{confessionId})
  const [savedEntries, setSavedEntries] = useState<SavedPost[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [extraSavedConfessions, setExtraSavedConfessions] = useState<Record<string, Confession>>({});
  const [unavailableSavedIds, setUnavailableSavedIds] = useState<Record<string, boolean>>({});
  const [clearingUnavailable, setClearingUnavailable] = useState(false);
  const [onlyMyPosts, setOnlyMyPosts] = useState(false);

  const [showCompose, setShowCompose] = useState(false);
  const [hasDraft, setHasDraft] = useState<boolean>(() => hasSavedComposeDraft());
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [reportTarget, setReportTarget] = useState<Confession | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [linkedThreadId, setLinkedThreadId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('thread');
  });
  const [linkedConfession, setLinkedConfession] = useState<Confession | null>(null);
  const [dismissedAnnouncement, setDismissedAnnouncement] = useState<string>('');
  const [dismissedSeedBar, setDismissedSeedBar] = useState(false);

  function clearLinkedThread() {
    setLinkedThreadId(null);
    setLinkedConfession(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('thread')) {
        url.searchParams.delete('thread');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }

  // Sync Tailwind v4 `.dark` class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      window.localStorage.setItem('tys-theme', 'dark');
    } else {
      root.classList.remove('dark');
      window.localStorage.setItem('tys-theme', 'light');
    }
  }, [darkMode]);

  function showToast(message: string) {
    setToast(message);
  }

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Keyboard shortcuts: '/' focuses search, 'c' opens composer when signed in
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'c' && currentProfile && !showCompose && !showProfileModal && !reportTarget) {
        e.preventDefault();
        setShowCompose(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentProfile, showCompose, showProfileModal, reportTarget]);

  // Track horizontal overflow on the 14-category rail so scroll chevrons appear only when needed
  useEffect(() => {
    const rail = categoryRailRef.current;
    if (!rail) return;

    function updateRailScroll() {
      const el = categoryRailRef.current;
      if (!el) return;
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    }

    updateRailScroll();
    rail.addEventListener('scroll', updateRailScroll, { passive: true });
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateRailScroll) : null;
    observer?.observe(rail);
    return () => {
      rail.removeEventListener('scroll', updateRailScroll);
      observer?.disconnect();
    };
  }, [activeSection]);

  function scrollCategoryRail(direction: -1 | 1) {
    const rail = categoryRailRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * 260, behavior: 'smooth' });
  }

  // Keep the active category tab scrolled into view when selected from a card kicker
  useEffect(() => {
    const rail = categoryRailRef.current;
    if (!rail) return;
    const activeTab = rail.querySelector<HTMLElement>('[aria-selected="true"]');
    activeTab?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [selectedTopic, activeSection]);

  // Show quiet Back-to-top button after scrolling down past the category bar
  useEffect(() => {
    function onScroll() {
      setShowBackToTop(window.scrollY > 520);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Auth Listener & Private/Public Profile Provisioning
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (user) {
        try {
          const ensured = await ensureUserAccountAndProfile(user);
          setCurrentProfile(ensured);
        } catch (err) {
          console.error('Failed to ensure profile:', err);
        }
      } else {
        setCurrentProfile(null);
        setUserVotes({});
        setSavedEntries([]);
        setExtraSavedConfessions({});
        setUnavailableSavedIds({});
        setOnlyMyPosts(false);
      }
    });
    return () => unsub();
  }, []);

  // Live subscription to current user's profile
  useEffect(() => {
    if (!authUser) return;
    const path = `userProfiles/${authUser.uid}`;
    const unsub = onSnapshot(
      doc(db, 'userProfiles', authUser.uid),
      (snap) => {
        if (snap.exists()) {
          setCurrentProfile(snap.data() as UserProfile);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
    return () => unsub();
  }, [authUser]);

  // Live subscription to current user's private Saved bookmarks
  useEffect(() => {
    if (!authUser) {
      setSavedEntries([]);
      setLoadingSaved(false);
      return;
    }
    setLoadingSaved(true);
    const path = `users/${authUser.uid}/saved`;
    const q = query(
      collection(db, 'users', authUser.uid, 'saved'),
      where('userId', '==', authUser.uid),
      limit(200)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .map((d) => d.data() as SavedPost)
          .sort((a, b) => {
            const ta = a.savedAt?.toMillis?.() ?? Date.now();
            const tb = b.savedAt?.toMillis?.() ?? Date.now();
            return tb - ta;
          });
        setSavedEntries(items);
        setLoadingSaved(false);
      },
      (error) => {
        setLoadingSaved(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [authUser]);

  // Live subscription to community policy settings
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'community'),
      (snap) => {
        if (snap.exists()) {
          setSettings(snap.data() as CommunitySettings);
        } else {
          setSettings(DEFAULT_COMMUNITY_SETTINGS);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'settings/community');
      }
    );
    return () => unsub();
  }, []);

  // Live subscription to confessions
  useEffect(() => {
    setLoadingConfessions(true);
    const q = query(
      collection(db, 'confessions'),
      where('status', 'in', ['active', 'flagged', 'quarantined']),
      limit(100)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Confession)
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() ?? Date.now();
            const tb = b.createdAt?.toMillis?.() ?? Date.now();
            return tb - ta;
          });
        setConfessions(items);
        setLoadingConfessions(false);
      },
      (error) => {
        setLoadingConfessions(false);
        handleFirestoreError(error, OperationType.LIST, 'confessions');
      }
    );
    return () => unsub();
  }, []);

  // Fetch any bookmarked confessions that aren't currently in the latest 100 feed items
  useEffect(() => {
    if (!authUser || savedEntries.length === 0) return;
    const loadedIds = new Set(confessions.map((c) => c.id));
    const missingIds = savedEntries
      .map((s) => s.confessionId)
      .filter((id) => !loadedIds.has(id) && !extraSavedConfessions[id] && !unavailableSavedIds[id]);
    if (missingIds.length === 0) return;

    let cancelled = false;
    async function fetchMissing() {
      const fetched: Record<string, Confession> = {};
      const missing: Record<string, boolean> = {};
      await Promise.all(
        missingIds.slice(0, 30).map(async (id) => {
          try {
            const snap = await getDoc(doc(db, 'confessions', id));
            if (snap.exists()) {
              const data = { id: snap.id, ...snap.data() } as Confession;
              if (data.status !== 'removed' && !data.isEncrypted) {
                fetched[id] = data;
              } else {
                missing[id] = true;
              }
            } else {
              missing[id] = true;
            }
          } catch {
            missing[id] = true;
          }
        })
      );
      if (!cancelled) {
        if (Object.keys(fetched).length > 0) {
          setExtraSavedConfessions((prev) => ({ ...prev, ...fetched }));
        }
        if (Object.keys(missing).length > 0) {
          setUnavailableSavedIds((prev) => ({ ...prev, ...missing }));
        }
      }
    }
    void fetchMissing();
    return () => {
      cancelled = true;
    };
  }, [authUser, savedEntries, confessions, extraSavedConfessions, unavailableSavedIds]);

  // Live subscription to pseudonymous profiles
  useEffect(() => {
    setLoadingProfiles(true);
    const q = query(
      collection(db, 'userProfiles'),
      where('status', 'in', ['active', 'muted', 'suspended']),
      limit(100)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setProfiles(snap.docs.map((d) => d.data() as UserProfile));
        setLoadingProfiles(false);
      },
      (error) => {
        setLoadingProfiles(false);
        handleFirestoreError(error, OperationType.LIST, 'userProfiles');
      }
    );
    return () => unsub();
  }, []);

  // Fetch direct ?thread=<id> target if it's outside the latest 100 feed posts
  useEffect(() => {
    if (!linkedThreadId || linkedThreadId.startsWith('preview-')) {
      setLinkedConfession(null);
      return;
    }
    if (confessions.some((c) => c.id === linkedThreadId)) {
      setLinkedConfession(null);
      return;
    }
    let cancelled = false;
    async function fetchLinked() {
      try {
        const snap = await getDoc(doc(db, 'confessions', linkedThreadId!));
        if (!cancelled && snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as Confession;
          if (data.status !== 'removed' && !data.isEncrypted) {
            setLinkedConfession(data);
          }
        }
      } catch {
        // Post unavailable or deleted
      }
    }
    void fetchLinked();
    return () => {
      cancelled = true;
    };
  }, [linkedThreadId, confessions]);

  // Load current user's votes for visible feed, older saved posts, and linked post
  const voteLookupIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of confessions.slice(0, 40)) ids.add(c.id);
    for (const id of Object.keys(extraSavedConfessions)) ids.add(id);
    if (linkedConfession) ids.add(linkedConfession.id);
    return Array.from(ids);
  }, [confessions, extraSavedConfessions, linkedConfession]);

  useEffect(() => {
    if (!authUser || voteLookupIds.length === 0) return;
    const pendingIds = voteLookupIds.filter((id) => !(id in userVotes));
    if (pendingIds.length === 0) return;

    let cancelled = false;
    async function loadMyVotes() {
      const entries: Record<string, number | null> = {};
      await Promise.all(
        pendingIds.map(async (confId) => {
          try {
            const snap = await getDoc(
              doc(db, 'confessions', confId, 'votes', authUser!.uid)
            );
            entries[confId] = snap.exists() ? (snap.data().value as number) : null;
          } catch {
            entries[confId] = null;
          }
        })
      );
      if (!cancelled) {
        setUserVotes((prev) => ({ ...prev, ...entries }));
      }
    }
    void loadMyVotes();
    return () => {
      cancelled = true;
    };
  }, [authUser, voteLookupIds, userVotes]);

  async function handleSignIn() {
    if (signingIn) return;
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Signed in.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in cancelled.';
      if (!msg.includes('popup-closed-by-user')) {
        showToast(msg);
      }
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    showToast('Signed out.');
  }

  async function handleSeedStarters() {
    if (!currentProfile || seeding) return;
    setSeeding(true);
    try {
      const added = await seedStarterConfessions(currentProfile, confessions);
      showToast(
        added > 0
          ? `Published ${added} sample ${added === 1 ? 'post' : 'posts'} across all categories.`
          : 'All sample posts are already on the board.'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to publish sample posts.');
    } finally {
      setSeeding(false);
    }
  }

  async function handleToggleSave(confession: Confession, currentlySaved: boolean) {
    if (!authUser) {
      await handleSignIn();
      return;
    }
    try {
      if (currentlySaved) {
        await unsaveConfession(authUser.uid, confession.id);
        showToast('Removed from Saved.');
      } else {
        await saveConfession(authUser.uid, confession);
        showToast('Saved to your bookmarks.');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to update bookmark.');
    }
  }

  async function handleClearUnavailableSaved() {
    if (!authUser || clearingUnavailable) return;
    const staleIds = savedEntries
      .map((e) => e.confessionId)
      .filter((id) => unavailableSavedIds[id]);
    if (staleIds.length === 0) return;

    setClearingUnavailable(true);
    try {
      await Promise.all(staleIds.map((id) => unsaveConfession(authUser.uid, id)));
      setUnavailableSavedIds({});
      showToast('Cleared unavailable bookmarks.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to clear bookmarks.');
    } finally {
      setClearingUnavailable(false);
    }
  }

  const savedIdSet = useMemo(
    () => new Set(savedEntries.map((entry) => entry.confessionId)),
    [savedEntries]
  );

  const savedConfessions = useMemo(() => {
    const byId = new Map<string, Confession>();
    for (const c of confessions) byId.set(c.id, c);
    for (const [id, c] of Object.entries(extraSavedConfessions)) {
      if (!byId.has(id)) byId.set(id, c);
    }
    const resolved: Confession[] = [];
    for (const entry of savedEntries) {
      const match = byId.get(entry.confessionId);
      if (match && !match.isEncrypted && match.status !== 'removed') {
        resolved.push(match);
      }
    }
    return resolved;
  }, [savedEntries, confessions, extraSavedConfessions]);

  const unavailableSavedCount = useMemo(
    () => savedEntries.filter((e) => unavailableSavedIds[e.confessionId]).length,
    [savedEntries, unavailableSavedIds]
  );

  const isColdStartPreview =
    activeSection === 'feed' && !loadingConfessions && confessions.length === 0;
  const missingStarterCount = useMemo(
    () => getMissingStarterPosts(confessions).length,
    [confessions]
  );
  const hasUnderfilledCategory = useMemo(() => {
    if (confessions.length === 0) return false;
    return CONFESSION_TOPICS.some(
      (topic) =>
        confessions.filter((c) => !c.isEncrypted && matchesPostCategory(c.body, topic, c.topic))
          .length < 2
    );
  }, [confessions]);
  const activeFeedSource = useMemo(() => {
    if (activeSection === 'saved') return savedConfessions;
    if (isColdStartPreview) return previewConfessions;
    if (linkedConfession && !confessions.some((c) => c.id === linkedConfession.id)) {
      return [linkedConfession, ...confessions];
    }
    return confessions;
  }, [activeSection, savedConfessions, isColdStartPreview, previewConfessions, linkedConfession, confessions]);

  const filteredConfessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = activeFeedSource.filter((c) => {
      if (c.isEncrypted) return false;
      if (activeSection === 'feed' && onlyMyPosts && currentProfile && c.authorUid !== currentProfile.uid) {
        return false;
      }
      if (selectedTopic !== 'All' && !matchesPostCategory(c.body, selectedTopic, c.topic)) {
        return false;
      }
      if (q) {
        const hay = `${c.title} ${c.body} ${c.topic} ${c.authorHandle} ${c.sensitivity}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    let ordered = list;
    if (sortMode === 'top') {
      ordered = [...list].sort((a, b) => b.score - a.score);
    } else if (sortMode === 'discussed') {
      ordered = [...list].sort((a, b) => {
        if (b.replyCount !== a.replyCount) return b.replyCount - a.replyCount;
        return b.score - a.score;
      });
    }
    if (activeSection === 'feed' && linkedThreadId) {
      const idx = ordered.findIndex((c) => c.id === linkedThreadId);
      if (idx > 0) {
        const copy = [...ordered];
        const [pinned] = copy.splice(idx, 1);
        return [pinned, ...copy];
      }
    }
    return ordered;
  }, [
    activeFeedSource,
    activeSection,
    onlyMyPosts,
    currentProfile,
    selectedTopic,
    searchQuery,
    sortMode,
    linkedThreadId,
  ]);

  const isAdmin = currentProfile?.role === 'admin';
  const isSignedIn = Boolean(authUser && currentProfile);

  // Guard restricted sections when auth/role changes
  useEffect(() => {
    if (!isSignedIn && activeSection !== 'feed') {
      setActiveSection('feed');
    } else if (!isAdmin && (activeSection === 'reputation' || activeSection === 'moderation')) {
      setActiveSection('feed');
    }
  }, [isSignedIn, isAdmin, activeSection]);

  const navItems: { id: ActiveSection; label: string; count?: number }[] = isSignedIn
    ? isAdmin
      ? [
          { id: 'feed', label: 'Feed' },
          { id: 'saved', label: 'Saved', count: savedConfessions.length },
          { id: 'reputation', label: 'Reputation' },
          { id: 'moderation', label: 'Moderation' },
        ]
      : [
          { id: 'feed', label: 'Feed' },
          { id: 'saved', label: 'Saved', count: savedConfessions.length },
        ]
    : [];

  return (
    <div className="min-h-screen bg-white dark:bg-[#0C0C0C] text-[#0C0C0C] dark:text-[#F2F2F2] flex flex-col">
      {/* TOP NAVIGATION: CNN-inspired crisp newsroom bar */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#0C0C0C]/95 backdrop-blur-sm border-b border-[#E6E6E6] dark:border-[#242424]">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4 sm:gap-6">
          <button
            type="button"
            onClick={() => {
              setActiveSection('feed');
              setSelectedTopic('All');
              setOnlyMyPosts(false);
            }}
            className="text-2xl font-extrabold tracking-[-0.04em] text-[#CC0000] whitespace-nowrap shrink-0 cursor-pointer"
          >
            TYS
          </button>

          <div className="flex-1 flex items-center justify-center gap-6 min-w-0">
            {navItems.length > 0 && (
              <nav
                aria-label="Primary navigation"
                className="hidden md:flex items-center gap-5 text-sm font-semibold shrink-0"
              >
                {navItems.map((item) => {
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSection(item.id)}
                      className={`py-1 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                        active
                          ? 'border-[#CC0000] text-[#0C0C0C] dark:text-[#F2F2F2]'
                          : 'border-transparent text-[#595959] dark:text-[#A3A3A3] hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2]'
                      }`}
                    >
                      <span>{item.label}</span>
                      {typeof item.count === 'number' && item.count > 0 && (
                        <span className="text-xs font-medium tabular-nums text-[#737373]">
                          ({item.count})
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            )}

            {/* Unified Top Nav Search */}
            <div className="relative flex-1 max-w-md min-w-0">
              <Search className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                role="searchbox"
                aria-label="Search across TYS"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchQuery('');
                    searchInputRef.current?.blur();
                  }
                }}
                placeholder={
                  activeSection === 'saved'
                    ? 'Search saved posts...'
                    : activeSection === 'reputation'
                      ? 'Search members...'
                      : activeSection === 'moderation'
                        ? 'Search reports, logs, members...'
                        : 'Search posts, topics...'
                }
                className="w-full pl-9 pr-8 py-1.5 text-sm rounded-md border border-[#D4D4D4] dark:border-[#2E2E2E] bg-[#F7F7F7] dark:bg-[#161616] text-[#0C0C0C] dark:text-[#F2F2F2] placeholder:text-[#737373] focus:outline-none focus:bg-white dark:focus:bg-[#1A1A1A] focus:ring-2 focus:ring-[#CC0000]/30 focus:border-[#CC0000]"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[#737373] hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <kbd
                  aria-hidden="true"
                  className="hidden sm:inline-flex items-center justify-center absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-semibold text-[#737373] border border-[#D4D4D4] dark:border-[#2E2E2E] rounded pointer-events-none"
                >
                  /
                </kbd>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-md text-[#595959] dark:text-[#A3A3A3] hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] hover:bg-[#F2F2F2] dark:hover:bg-[#1A1A1A] transition-colors shrink-0 cursor-pointer"
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-[#FBBF24]" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            {isSignedIn ? (
              <button
                type="button"
                onClick={() => setShowCompose(true)}
                title={hasDraft ? 'Resume your saved draft (press C)' : 'Create a new post (press C)'}
                className="relative inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-md bg-[#CC0000] text-white hover:bg-[#A80000] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{hasDraft ? 'Draft' : 'New Post'}</span>
                {hasDraft && (
                  <span
                    aria-hidden="true"
                    className="w-1.5 h-1.5 rounded-full bg-white"
                  />
                )}
              </button>
            ) : (
              <button
                type="button"
                disabled={signingIn || !authReady}
                onClick={handleSignIn}
                className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-md bg-[#0C0C0C] text-white dark:bg-[#F2F2F2] dark:text-[#0C0C0C] hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
              >
                {signingIn ? 'Signing in...' : 'Sign in'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* CNN-style Scrollable Categories Section Rail directly below Top Nav */}
      {(activeSection === 'feed' || activeSection === 'saved') && (
        <div className="border-b border-[#E6E6E6] dark:border-[#242424] bg-white dark:bg-[#0C0C0C]">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 relative flex items-center">
            {canScrollLeft && (
              <button
                type="button"
                onClick={() => scrollCategoryRail(-1)}
                aria-label="Scroll categories left"
                className="hidden sm:flex items-center justify-center w-7 h-7 mr-1 rounded-md text-[#595959] dark:text-[#A3A3A3] hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] hover:bg-[#F2F2F2] dark:hover:bg-[#1A1A1A] shrink-0 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div
              ref={categoryRailRef}
              role="tablist"
              aria-label="Discussion categories"
              className="flex-1 flex items-center gap-5 overflow-x-auto scrollbar-none"
            >
              {(['All', ...CONFESSION_TOPICS] as const).map((topic) => {
                const active = selectedTopic === topic;
                return (
                  <button
                    key={topic}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedTopic(topic)}
                    className={`py-2.5 text-[13px] transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                      active
                        ? 'border-[#CC0000] text-[#0C0C0C] dark:text-[#F2F2F2] font-bold'
                        : 'border-transparent text-[#595959] dark:text-[#A3A3A3] font-medium hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2]'
                    }`}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
            {canScrollRight && (
              <button
                type="button"
                onClick={() => scrollCategoryRail(1)}
                aria-label="Scroll categories right"
                className="hidden sm:flex items-center justify-center w-7 h-7 ml-1 rounded-md text-[#595959] dark:text-[#A3A3A3] hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] hover:bg-[#F2F2F2] dark:hover:bg-[#1A1A1A] shrink-0 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mobile section switcher (visible on small viewports when signed in) */}
      {navItems.length > 0 && (
        <div className="md:hidden border-b border-[#E6E6E6] dark:border-[#242424] px-4 py-2 flex items-center gap-5 overflow-x-auto scrollbar-none text-xs font-semibold">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`whitespace-nowrap shrink-0 py-1 inline-flex items-center gap-1 cursor-pointer ${
                activeSection === item.id
                  ? 'text-[#CC0000]'
                  : 'text-[#595959] dark:text-[#A3A3A3]'
              }`}
            >
              <span>{item.label}</span>
              {typeof item.count === 'number' && item.count > 0 && (
                <span className="tabular-nums text-[#737373]">({item.count})</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* SINGLE FOCUSED EDITORIAL COLUMN — aligned edge-to-edge with top nav */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-5 sm:py-7">
        {isAdmin && activeSection === 'reputation' ? (
          <ReputationView
            currentProfile={currentProfile}
            profiles={profiles}
            loading={loadingProfiles}
            searchQuery={searchQuery}
            onClearSearch={() => setSearchQuery('')}
            onRequireSignIn={handleSignIn}
            onToast={showToast}
          />
        ) : isAdmin && activeSection === 'moderation' ? (
          <ModerationView
            currentProfile={currentProfile}
            confessions={confessions}
            profiles={profiles}
            settings={settings}
            searchQuery={searchQuery}
            onClearSearch={() => setSearchQuery('')}
            onRequireSignIn={handleSignIn}
            onToast={showToast}
          />
        ) : (
          <div>
            {/* Live Admin Community Announcement (only rendered on Feed when set) */}
            {activeSection === 'feed' &&
              settings.announcement.trim() &&
              dismissedAnnouncement !== settings.announcement.trim() && (
                <div className="mb-4 px-4 py-2.5 rounded-md border border-[#E6E6E6] dark:border-[#262626] bg-[#F7F7F7] dark:bg-[#161616] flex items-center justify-between gap-3 text-sm text-[#262626] dark:text-[#E5E5E5]">
                  <p className="leading-relaxed">{settings.announcement.trim()}</p>
                  <button
                    type="button"
                    onClick={() => setDismissedAnnouncement(settings.announcement.trim())}
                    aria-label="Dismiss announcement"
                    className="p-1 text-[#737373] hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] shrink-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

            {/* Shared Thread Pin Notice */}
            {activeSection === 'feed' && linkedThreadId && (
              <div className="mb-4 px-3.5 py-2 rounded-md border border-[#E6E6E6] dark:border-[#262626] bg-[#F7F7F7] dark:bg-[#161616] flex items-center justify-between gap-3 text-xs text-[#595959] dark:text-[#A3A3A3]">
                <span>Showing shared post first.</span>
                <button
                  type="button"
                  onClick={clearLinkedThread}
                  className="font-semibold text-[#CC0000] hover:underline whitespace-nowrap cursor-pointer"
                >
                  Back to feed
                </button>
              </div>
            )}

            {/* Personal Posts Filter Notice (triggered from Profile) */}
            {activeSection === 'feed' && onlyMyPosts && (
              <div className="mb-4 px-3.5 py-2 rounded-md border border-[#E6E6E6] dark:border-[#262626] bg-[#F7F7F7] dark:bg-[#161616] flex items-center justify-between gap-3 text-xs text-[#595959] dark:text-[#A3A3A3]">
                <span>Showing your posts (including anonymous).</span>
                <button
                  type="button"
                  onClick={() => setOnlyMyPosts(false)}
                  className="font-semibold text-[#CC0000] hover:underline whitespace-nowrap cursor-pointer"
                >
                  Show all posts
                </button>
              </div>
            )}

            {/* Unavailable Saved Bookmarks Cleanup Notice */}
            {activeSection === 'saved' && unavailableSavedCount > 0 && (
              <div className="mb-4 px-3.5 py-2 rounded-md border border-[#E6E6E6] dark:border-[#262626] bg-[#F7F7F7] dark:bg-[#161616] flex items-center justify-between gap-3 text-xs text-[#595959] dark:text-[#A3A3A3]">
                <span>
                  {unavailableSavedCount}{' '}
                  {unavailableSavedCount === 1 ? 'saved post is' : 'saved posts are'} no longer
                  available.
                </span>
                <button
                  type="button"
                  disabled={clearingUnavailable}
                  onClick={handleClearUnavailableSaved}
                  className="font-semibold text-[#CC0000] hover:underline disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  {clearingUnavailable ? 'Clearing...' : 'Clear'}
                </button>
              </div>
            )}

            {/* Single Compact Utility Row: Sort + Signed-in Identity */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[#E6E6E6] dark:border-[#242424]">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-0.5 p-0.5 bg-[#F2F2F2] dark:bg-[#1A1A1A] rounded-md shrink-0">
                  <button
                    type="button"
                    onClick={() => setSortMode('latest')}
                    className={`px-3 py-1 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                      sortMode === 'latest'
                        ? 'bg-white dark:bg-[#2A2A2A] text-[#0C0C0C] dark:text-[#F2F2F2]'
                        : 'text-[#595959] dark:text-[#A3A3A3]'
                    }`}
                  >
                    {activeSection === 'saved' ? 'Recently saved' : 'Latest'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortMode('top')}
                    className={`px-3 py-1 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                      sortMode === 'top'
                        ? 'bg-white dark:bg-[#2A2A2A] text-[#0C0C0C] dark:text-[#F2F2F2]'
                        : 'text-[#595959] dark:text-[#A3A3A3]'
                    }`}
                  >
                    Top
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortMode('discussed')}
                    className={`px-3 py-1 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                      sortMode === 'discussed'
                        ? 'bg-white dark:bg-[#2A2A2A] text-[#0C0C0C] dark:text-[#F2F2F2]'
                        : 'text-[#595959] dark:text-[#A3A3A3]'
                    }`}
                  >
                    Discussed
                  </button>
                </div>

                {activeSection === 'saved' && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#595959] dark:text-[#A3A3A3]">
                    <Bookmark className="w-3.5 h-3.5 text-[#CC0000] fill-current" />
                    <span className="tabular-nums">
                      {filteredConfessions.length} saved
                    </span>
                  </span>
                )}

                {searchQuery.trim() && (
                  <span className="text-xs text-[#595959] dark:text-[#A3A3A3] tabular-nums">
                    {filteredConfessions.length}{' '}
                    {filteredConfessions.length === 1 ? 'result' : 'results'}
                  </span>
                )}
              </div>

              {currentProfile ? (
                <div className="flex items-center gap-3 text-xs text-[#595959] dark:text-[#A3A3A3] min-w-0">
                  <button
                    type="button"
                    onClick={() => setShowProfileModal(true)}
                    title="Edit handle & posting defaults"
                    className="inline-flex items-center gap-1.5 hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] transition-colors truncate cursor-pointer"
                  >
                    <span className="font-semibold text-[#0C0C0C] dark:text-[#F2F2F2] truncate">
                      @{currentProfile.handle}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums whitespace-nowrap">
                      {currentProfile.reputation} rep
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    aria-label="Sign out"
                    title="Sign out"
                    className="p-1 text-[#737373] hover:text-[#CC0000] transition-colors shrink-0 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <span className="text-xs text-[#595959] dark:text-[#A3A3A3] tabular-nums">
                  {filteredConfessions.length}{' '}
                  {filteredConfessions.length === 1 ? 'post' : 'posts'}
                </span>
              )}
            </div>

            {/* Quiet Cold-Start Notice (only while Firestore has 0 documents on Feed) */}
            {isColdStartPreview && (
              <div className="mt-4 py-2.5 px-3.5 rounded-md border border-[#E6E6E6] dark:border-[#242424] bg-[#F7F7F7] dark:bg-[#161616] flex flex-wrap items-center justify-between gap-2 text-xs text-[#595959] dark:text-[#A3A3A3]">
                <span>Showing 28 sample posts across all 14 categories until published to the live board.</span>
                {currentProfile ? (
                  <button
                    type="button"
                    disabled={seeding}
                    onClick={handleSeedStarters}
                    className="font-semibold text-[#CC0000] hover:underline disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    {seeding ? 'Publishing...' : 'Publish all 28 samples'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSignIn}
                    className="font-semibold text-[#CC0000] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Sign in to publish
                  </button>
                )}
              </div>
            )}

            {/* Quiet Fill-Categories Prompt when live board exists but some categories have < 2 posts */}
            {activeSection === 'feed' &&
              !isColdStartPreview &&
              !loadingConfessions &&
              currentProfile &&
              hasUnderfilledCategory &&
              missingStarterCount > 0 &&
              !dismissedSeedBar && (
                <div className="mt-4 py-2.5 px-3.5 rounded-md border border-[#E6E6E6] dark:border-[#242424] bg-[#F7F7F7] dark:bg-[#161616] flex flex-wrap items-center justify-between gap-2 text-xs text-[#595959] dark:text-[#A3A3A3]">
                  <span>
                    {missingStarterCount} new sample{' '}
                    {missingStarterCount === 1 ? 'post is' : 'posts are'} ready to fill all 14
                    categories.
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      disabled={seeding}
                      onClick={handleSeedStarters}
                      className="font-semibold text-[#CC0000] hover:underline disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      {seeding ? 'Publishing...' : `Publish ${missingStarterCount} samples`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDismissedSeedBar(true)}
                      aria-label="Dismiss sample post notice"
                      className="p-0.5 text-[#737373] hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

            {/* FEED / SAVED STREAM */}
            {loadingConfessions || (activeSection === 'saved' && loadingSaved) ? (
              <div className="divide-y divide-[#E6E6E6] dark:divide-[#242424]">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="py-6 space-y-2.5">
                    <div className="h-3 w-40 rounded bg-[#F2F2F2] dark:bg-[#1A1A1A] animate-pulse" />
                    <div className="h-5 w-3/4 rounded bg-[#F2F2F2] dark:bg-[#1A1A1A] animate-pulse" />
                    <div className="h-12 w-full rounded bg-[#F2F2F2] dark:bg-[#1A1A1A] animate-pulse" />
                  </div>
                ))}
              </div>
            ) : filteredConfessions.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-xl font-bold text-[#0C0C0C] dark:text-[#F2F2F2]">
                  {searchQuery.trim()
                    ? `No posts match "${searchQuery.trim()}"`
                    : activeSection === 'saved'
                      ? savedEntries.length === 0
                        ? 'No saved posts yet'
                        : 'No saved posts in this category'
                      : onlyMyPosts
                        ? 'No posts from you here yet'
                        : 'Nothing in this category yet'}
                </p>
                <p className="mt-2 text-sm text-[#595959] dark:text-[#A3A3A3] max-w-md mx-auto">
                  {searchQuery.trim()
                    ? 'Try a different search term or clear your search.'
                    : activeSection === 'saved'
                      ? savedEntries.length === 0
                        ? 'Tap Save on any post in the feed to keep it in your personal bookmarks.'
                        : 'Switch back to All categories to view all of your saved posts.'
                      : 'Start the conversation here or switch back to the full feed.'}
                </p>
                <div className="mt-6 flex items-center justify-center gap-3">
                  {activeSection === 'saved' && savedEntries.length === 0 && !searchQuery.trim() ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSection('feed');
                        setSelectedTopic('All');
                      }}
                      className="px-4 py-2 text-sm font-semibold rounded-md bg-[#CC0000] text-white hover:bg-[#A80000] cursor-pointer"
                    >
                      Browse feed
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedTopic('All');
                          setOnlyMyPosts(false);
                          if (activeSection !== 'saved') setActiveSection('feed');
                        }}
                        className="px-4 py-2 text-sm font-semibold rounded-md border border-[#D4D4D4] dark:border-[#333333] text-[#0C0C0C] dark:text-[#F2F2F2] cursor-pointer"
                      >
                        {searchQuery.trim()
                          ? 'Clear search'
                          : activeSection === 'saved'
                            ? 'Show all saved'
                            : 'Show all posts'}
                      </button>
                      {activeSection === 'feed' && currentProfile && !searchQuery.trim() && (
                        <button
                          type="button"
                          onClick={() => setShowCompose(true)}
                          className="px-4 py-2 text-sm font-semibold rounded-md bg-[#CC0000] text-white hover:bg-[#A80000] cursor-pointer"
                        >
                          New Post
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div>
                {filteredConfessions.map((confession) => (
                  <ConfessionCard
                    key={confession.id}
                    confession={confession}
                    currentProfile={currentProfile}
                    currentVote={userVotes[confession.id] ?? null}
                    isSaved={savedIdSet.has(confession.id)}
                    defaultExpanded={linkedThreadId === confession.id}
                    onVoteChange={(id, nextVote) =>
                      setUserVotes((prev) => ({ ...prev, [id]: nextVote }))
                    }
                    onToggleSave={handleToggleSave}
                    onRequireSignIn={handleSignIn}
                    onOpenReport={(conf) => {
                      if (conf.id.startsWith('preview-')) {
                        showToast('Publish posts to the live board before flagging.');
                        return;
                      }
                      setReportTarget(conf);
                    }}
                    onToast={showToast}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Quiet Minimal Footer */}
      <footer className="border-t border-[#E6E6E6] dark:border-[#242424] mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-5 flex items-center justify-between gap-4 text-xs text-[#595959] dark:text-[#A3A3A3]">
          <span className="font-semibold text-[#0C0C0C] dark:text-[#F2F2F2]">
            TYS — Talk Your Shit
          </span>
          {isSignedIn && (
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={() => setActiveSection('saved')}
                className="hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] cursor-pointer"
              >
                Saved
              </button>
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveSection('reputation')}
                    className="hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] cursor-pointer"
                  >
                    Reputation
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSection('moderation')}
                    className="hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] cursor-pointer"
                  >
                    Moderation
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </footer>

      {showCompose && currentProfile && (
        <ComposeModal
          profile={currentProfile}
          settings={settings}
          onClose={() => {
            setShowCompose(false);
            setHasDraft(hasSavedComposeDraft());
          }}
          onSuccess={() => {
            setHasDraft(false);
            clearLinkedThread();
            showToast('Post published.');
          }}
        />
      )}

      {showProfileModal && currentProfile && (
        <ProfileModal
          profile={currentProfile}
          onClose={() => setShowProfileModal(false)}
          onUpdated={() => showToast('Profile updated.')}
          onViewMyPosts={() => {
            setActiveSection('feed');
            setSelectedTopic('All');
            setOnlyMyPosts(true);
          }}
        />
      )}

      {reportTarget && currentProfile && (
        <ReportModal
          confession={reportTarget}
          reporterProfile={currentProfile}
          autoQuarantineFlags={settings.autoQuarantineFlags}
          minRepToReport={settings.minRepToReport}
          onClose={() => setReportTarget(null)}
          onSubmitted={() => showToast('Flag sent for review.')}
        />
      )}

      {showBackToTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
          title="Back to top"
          className="fixed bottom-5 left-5 z-40 p-2.5 rounded-md border border-[#E6E6E6] dark:border-[#2A2A2A] bg-white/95 dark:bg-[#141414]/95 text-[#0C0C0C] dark:text-[#F2F2F2] hover:border-[#CC0000] hover:text-[#CC0000] shadow-sm transition-colors cursor-pointer"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-sm px-4 py-3 rounded-md bg-[#0C0C0C] text-white dark:bg-[#F2F2F2] dark:text-[#0C0C0C] text-xs font-semibold shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
