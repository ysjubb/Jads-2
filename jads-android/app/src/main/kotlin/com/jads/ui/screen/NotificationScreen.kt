package com.jads.ui.screen

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jads.ui.theme.JadsColors
import com.jads.ui.viewmodel.NotificationItem
import com.jads.ui.viewmodel.NotificationCategory
import com.jads.ui.viewmodel.NotificationViewModel

// ─────────────────────────────────────────────────────────────────────────────
// NotificationScreen — displays all in-app notifications in a categorised
// LazyColumn with swipe-to-dismiss and tabbed category filtering.
//
// Features:
//   1. Categorised tabs: All / Expiry / Permission / Compliance / System
//   2. LazyColumn of NotificationCard with unread indicator
//   3. Swipe-to-dismiss to mark read
//   4. Pull-to-refresh
//   5. Mark All Read FAB
// ─────────────────────────────────────────────────────────────────────────────

private val CategoryColors = mapOf(
    NotificationCategory.EXPIRY     to Color(0xFFFFB800),
    NotificationCategory.PERMISSION to Color(0xFF00AAFF),
    NotificationCategory.COMPLIANCE to Color(0xFFFF3B3B),
    NotificationCategory.SYSTEM     to Color(0xFF8B5CF6),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationScreen(
    viewModel: NotificationViewModel,
    onBack:    () -> Unit
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val tabs  = listOf("ALL", "EXPIRY", "PERMISSION", "COMPLIANCE", "SYSTEM")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Notifications", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    // Unread badge
                    if (state.unreadCount > 0) {
                        Badge(
                            containerColor = MaterialTheme.colorScheme.error,
                            contentColor   = MaterialTheme.colorScheme.onError
                        ) {
                            Text("${state.unreadCount}")
                        }
                        Spacer(Modifier.width(8.dp))
                    }

                    // Mark all read
                    IconButton(onClick = { viewModel.markAllRead() }) {
                        Icon(Icons.Filled.DoneAll, contentDescription = "Mark all read")
                    }
                    // Refresh
                    IconButton(onClick = { viewModel.refresh() }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // ── Category tabs ────────────────────────────────────────────────
            ScrollableTabRow(
                selectedTabIndex = tabs.indexOf(state.selectedTab),
                edgePadding      = 16.dp,
                containerColor   = MaterialTheme.colorScheme.surface,
                contentColor     = MaterialTheme.colorScheme.primary,
                divider          = {}
            ) {
                tabs.forEachIndexed { index, tab ->
                    Tab(
                        selected = state.selectedTab == tab,
                        onClick  = { viewModel.selectTab(tab) },
                        text     = {
                            Text(
                                tab,
                                fontSize  = 12.sp,
                                fontWeight = if (state.selectedTab == tab) FontWeight.Bold else FontWeight.Normal
                            )
                        }
                    )
                }
            }

            Divider(color = MaterialTheme.colorScheme.outlineVariant)

            // ── Notification list ────────────────────────────────────────────
            if (state.isLoading && state.notifications.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(32.dp))
                }
            } else if (state.notifications.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Filled.NotificationsNone,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint     = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "No notifications",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 14.sp
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier     = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(vertical = 8.dp)
                ) {
                    items(
                        items = state.notifications,
                        key   = { it.id }
                    ) { notification ->
                        val dismissState = rememberSwipeToDismissBoxState(
                            confirmValueChange = { value ->
                                if (value == SwipeToDismissBoxValue.EndToStart ||
                                    value == SwipeToDismissBoxValue.StartToEnd
                                ) {
                                    viewModel.markRead(notification.id)
                                    true
                                } else false
                            }
                        )

                        SwipeToDismissBox(
                            state                = dismissState,
                            backgroundContent    = {
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f))
                                        .padding(horizontal = 20.dp),
                                    contentAlignment = Alignment.CenterEnd
                                ) {
                                    Icon(
                                        Icons.Filled.Done,
                                        contentDescription = "Mark read",
                                        tint = MaterialTheme.colorScheme.primary
                                    )
                                }
                            },
                            enableDismissFromStartToEnd = true,
                            enableDismissFromEndToStart = true
                        ) {
                            NotificationCard(
                                notification = notification,
                                onClick      = { viewModel.markRead(notification.id) }
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── NotificationCard ─────────────────────────────────────────────────────────

@Composable
private fun NotificationCard(
    notification: NotificationItem,
    onClick:      () -> Unit
) {
    val category = notification.category
    val catColor = CategoryColors[category] ?: MaterialTheme.colorScheme.primary

    val bgColor by animateColorAsState(
        targetValue = if (notification.read)
            MaterialTheme.colorScheme.surface
        else
            catColor.copy(alpha = 0.06f),
        label = "bg"
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clickable(enabled = !notification.read) { onClick() },
        shape  = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = bgColor),
        elevation = CardDefaults.cardElevation(defaultElevation = if (notification.read) 0.dp else 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            // Category colour dot
            Box(
                modifier = Modifier
                    .padding(top = 4.dp)
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(if (notification.read) Color.Gray else catColor)
            )

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                // Title
                Text(
                    text       = notification.title,
                    fontSize   = 13.sp,
                    fontWeight = if (notification.read) FontWeight.Normal else FontWeight.SemiBold,
                    color      = if (notification.read)
                        MaterialTheme.colorScheme.onSurfaceVariant
                    else
                        MaterialTheme.colorScheme.onSurface,
                    maxLines   = 1,
                    overflow   = TextOverflow.Ellipsis
                )

                Spacer(Modifier.height(2.dp))

                // Body
                Text(
                    text     = notification.body,
                    fontSize = 12.sp,
                    color    = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 16.sp
                )

                Spacer(Modifier.height(4.dp))

                // Timestamp + type
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text     = notification.timeAgo,
                        fontSize = 10.sp,
                        color    = MaterialTheme.colorScheme.outline
                    )
                    Spacer(Modifier.width(8.dp))
                    Surface(
                        shape = RoundedCornerShape(4.dp),
                        color = catColor.copy(alpha = 0.15f)
                    ) {
                        Text(
                            text     = notification.type.replace("_", " "),
                            fontSize = 9.sp,
                            color    = catColor,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
            }
        }
    }
}
