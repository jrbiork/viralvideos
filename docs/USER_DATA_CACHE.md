# User Data Cache

This document explains how to use the new in-memory user data cache to reduce API calls and improve performance.

## Overview

The `useUserDataCache` hook provides an in-memory cache for user data that:

- Caches user data for 5 minutes
- Uses stale-while-revalidate pattern (serves stale data while fetching fresh data in background)
- Automatically updates credits via WebSocket
- Prevents duplicate API calls
- Clears cache on logout

## Usage

### Basic Usage

```typescript
import { useUserDataCache } from '../hooks/useUserDataCache';

function MyComponent() {
  const { userData, loading, error, refresh, updateCredits } =
    useUserDataCache();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h1>Welcome, {userData?.user.name}</h1>
      <p>Credits: {userData?.user.creditsAvailable}</p>
    </div>
  );
}
```

### Available Properties

- `userData`: Cached user data object
- `loading`: Boolean indicating if data is being fetched
- `error`: Error message if fetch failed
- `refresh()`: Force refresh user data from API
- `updateCredits(newCredits)`: Update credits in cache (used by WebSocket)
- `clearCache()`: Clear the cache for current user
- `credits`: Convenience getter for credits
- `userInfo`: Convenience getter for user info

### Integration with Existing Hooks

The `useUserCredits` hook has been updated to use the cache automatically:

```typescript
import { useUserCredits } from '../components/useUserCredits';

function CreditsDisplay() {
  const { credits, loading, error, refreshCredits } = useUserCredits();

  // credits will now come from cache when available
  // WebSocket updates will automatically update the cache
}
```

### Cache Behavior

1. **First Load**: Fetches from API and caches result
2. **Subsequent Loads**: Returns cached data immediately
3. **Stale Data**: If data is older than 10 minutes, serves cached data but fetches fresh data in background
4. **Expired Data**: If data is older than 5 minutes, fetches fresh data
5. **WebSocket Updates**: Automatically updates credits in cache
6. **Logout**: Clears all cached data

### Performance Benefits

- **Reduced API Calls**: User data is cached for 5 minutes
- **Faster UI**: Cached data loads instantly
- **Background Updates**: Fresh data is fetched in background when stale
- **WebSocket Integration**: Credits update in real-time without API calls

### Migration Guide

To migrate existing components:

1. **Replace direct API calls**:

   ```typescript
   // Before
   const response = await fetch('/api/user');
   const data = await response.json();

   // After
   const { userData } = useUserDataCache();
   ```

2. **Update loading states**:

   ```typescript
   // Before
   const [loading, setLoading] = useState(false);

   // After
   const { loading } = useUserDataCache();
   ```

3. **Use cached data**:

   ```typescript
   // Before
   const [user, setUser] = useState(null);
   useEffect(() => {
     fetchUser().then(setUser);
   }, []);

   // After
   const { userData } = useUserDataCache();
   ```

## Examples

### Settings Page

```typescript
function SettingsPage() {
  const { userData, loading } = useUserDataCache();

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <h1>Settings for {userData?.user.name}</h1>
      <p>Email: {userData?.user.email}</p>
    </div>
  );
}
```

### Credits Display

```typescript
function CreditsDisplay() {
  const { credits, loading } = useUserCredits(); // Uses cache internally

  return <div>Credits: {loading ? '...' : credits}</div>;
}
```

### Force Refresh

```typescript
function UserProfile() {
  const { userData, refresh } = useUserDataCache();

  const handleRefresh = async () => {
    await refresh(); // Force fetch fresh data
  };

  return (
    <div>
      <button onClick={handleRefresh}>Refresh Profile</button>
      {/* ... */}
    </div>
  );
}
```

## Best Practices

1. **Use the cache hook** instead of direct API calls for user data
2. **Let WebSocket handle credit updates** - don't manually refresh credits
3. **Use the loading state** from the cache hook
4. **Handle errors** from the cache hook
5. **Don't clear cache manually** unless necessary - it clears on logout automatically

## Technical Details

- **Cache Duration**: 5 minutes
- **Stale Threshold**: 10 minutes
- **Storage**: In-memory Map
- **Cleanup**: Automatic on logout
- **Thread Safety**: Single-threaded (React)
- **Memory Usage**: Minimal (only stores user data)
