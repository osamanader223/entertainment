// =====================================================================
// Placeholder Database types.
// Regenerate with: npx supabase gen types typescript --local > src/types/database.ts
// Stub kept minimal so the project type-checks before first gen.
// =====================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          display_name: string | null;
          phone: string | null;
          phone_verified: boolean;
          email: string | null;
          email_verified: boolean;
          avatar_url: string | null;
          preferred_locale: string | null;
          date_of_birth: string | null;
          gender: string | null;
          marketing_whatsapp_consent: boolean;
          marketing_sms_consent: boolean;
          marketing_email_consent: boolean;
          walk_in_created: boolean;
          phone_lookup_consent: boolean;
          claimed_at: string | null;
          last_seen_at: string | null;
          whatsapp_window_expires_at: string | null;
          whatsapp_opted_out: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
        Relationships: [];
      };
      tenants: {
        Row: {
          id: string;
          slug: string;
          display_name: string;
          legal_name: string | null;
          country_code: string;
          currency: string;
          timezone: string;
          default_locale: string;
          status: Database['public']['Enums']['tenant_status'];
          brand_primary_color: string | null;
          brand_accent_color: string | null;
          brand_danger_color: string | null;
          logo_url: string | null;
          plan_tier: string;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['tenants']['Row']>;
        Update: Partial<Database['public']['Tables']['tenants']['Row']>;
        Relationships: [];
      };
      branches: {
        Row: {
          id: string;
          tenant_id: string;
          code: string;
          display_name: string;
          address_line: string | null;
          city: string | null;
          phone: string | null;
          whatsapp_number: string | null;
          opens_at: string;
          closes_at: string;
          status: Database['public']['Enums']['branch_status'];
          queue_policy: Json;
          ifttt_webhook_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['branches']['Row']> & {
          tenant_id: string;
          code: string;
          display_name: string;
        };
        Update: Partial<Database['public']['Tables']['branches']['Row']>;
        Relationships: [];
      };
      user_tenant_roles: {
        Row: {
          id: string;
          user_id: string;
          tenant_id: string;
          branch_id: string | null;
          role: Database['public']['Enums']['app_role'];
          is_active: boolean;
          granted_at: string;
        };
        Insert: Partial<Database['public']['Tables']['user_tenant_roles']['Row']> & {
          user_id: string;
          tenant_id: string;
          role: Database['public']['Enums']['app_role'];
        };
        Update: Partial<Database['public']['Tables']['user_tenant_roles']['Row']>;
        Relationships: [];
      };
      platform_admins: {
        Row: { user_id: string; granted_at: string; notes: string | null };
        Insert: { user_id: string; notes?: string | null };
        Update: { notes?: string | null };
        Relationships: [];
      };
      wallets: {
        Row: {
          id: string;
          tenant_id: string;
          customer_id: string;
          balance_cents: number;
          currency: string;
          lifetime_credited_cents: number;
          lifetime_debited_cents: number;
          is_frozen: boolean;
          frozen_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { tenant_id: string; customer_id: string } & Partial<Database['public']['Tables']['wallets']['Row']>;
        Update: Partial<Database['public']['Tables']['wallets']['Row']>;
        Relationships: [];
      };
      wallet_ledger: {
        Row: {
          id: string;
          tenant_id: string;
          wallet_id: string;
          kind: Database['public']['Enums']['wallet_entry_kind'];
          delta_cents: number;
          balance_after_cents: number;
          reason: string | null;
          reference_type: string | null;
          reference_id: string | null;
          metadata: Json | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      loyalty_accounts: {
        Row: {
          id: string;
          tenant_id: string;
          customer_id: string;
          points_balance: number;
          lifetime_points_earned: number;
          lifetime_points_redeemed: number;
          tier: Database['public']['Enums']['loyalty_tier'];
          current_streak_days: number;
          longest_streak_days: number;
          last_visit_date: string | null;
          referral_code: string | null;
          referred_by_customer_id: string | null;
          enrolled_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['loyalty_accounts']['Row']>;
        Update: Partial<Database['public']['Tables']['loyalty_accounts']['Row']>;
        Relationships: [];
      };
      loyalty_ledger: {
        Row: {
          id: string;
          tenant_id: string;
          account_id: string;
          delta_points: number;
          reason: string;
          reference_type: string | null;
          reference_id: string | null;
          metadata: Json | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      game_types: {
        Row: {
          id: string;
          tenant_id: string;
          category: Database['public']['Enums']['game_category'];
          code: string;
          display_name_ar: string;
          display_name_en: string;
          description: string | null;
          icon: string | null;
          min_players: number | null;
          max_players: number | null;
          default_duration_min: number | null;
          supports_player_count: boolean;
          is_active: boolean;
          sort_order: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['game_types']['Row']>;
        Update: Partial<Database['public']['Tables']['game_types']['Row']>;
        Relationships: [];
      };
      stations: {
        Row: {
          id: string;
          tenant_id: string;
          branch_id: string;
          game_type_id: string;
          code: string;
          display_name: string;
          status: Database['public']['Enums']['station_status'];
          ifttt_event_on: string | null;
          ifttt_event_off: string | null;
          ifttt_event_alert: string | null;
          position_x: number | null;
          position_y: number | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['stations']['Row']> & {
          tenant_id: string;
          branch_id: string;
          game_type_id: string;
          code: string;
          display_name: string;
        };
        Update: Partial<Database['public']['Tables']['stations']['Row']>;
        Relationships: [];
      };
      pricing_rules: {
        Row: {
          id: string;
          tenant_id: string;
          branch_id: string | null;
          game_type_id: string;
          name: string;
          unit: Database['public']['Enums']['pricing_unit'];
          amount_cents: number;
          currency: string;
          starts_at_time: string | null;
          ends_at_time: string | null;
          days_of_week: number[] | null;
          valid_from: string | null;
          valid_to: string | null;
          priority: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['pricing_rules']['Row']> & {
          tenant_id: string;
          game_type_id: string;
          name: string;
          unit: Database['public']['Enums']['pricing_unit'];
          amount_cents: number;
        };
        Update: Partial<Database['public']['Tables']['pricing_rules']['Row']>;
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          tenant_id: string;
          branch_id: string;
          customer_id: string | null;
          game_type_id: string;
          station_id: string | null;
          player_count: number;
          duration_mode: Database['public']['Enums']['duration_mode'];
          duration_minutes: number | null;
          scheduled_start_at: string;
          scheduled_end_at: string | null;
          estimated_amount_cents: number;
          deposit_amount_cents: number;
          currency: string;
          status: Database['public']['Enums']['booking_status'];
          source: string | null;
          notes: string | null;
          reference_code: string;
          wallet_paid_cents: number;
          held_payment_id: string | null;
          confirmed_at: string | null;
          checked_in_at: string | null;
          cancelled_at: string | null;
          cancelled_reason: string | null;
          created_by: string | null;
          booking_mode: 'instant' | 'scheduled';
          customer_present: boolean;
          present_marked_at: string | null;
          no_show_at: string | null;
          auto_started: boolean;
          slot_released: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['bookings']['Row']> & {
          tenant_id: string;
          branch_id: string;
          game_type_id: string;
          scheduled_start_at: string;
        };
        Update: Partial<Database['public']['Tables']['bookings']['Row']>;
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          tenant_id: string;
          branch_id: string;
          station_id: string;
          booking_id: string | null;
          customer_id: string | null;
          player_count: number;
          customer_label: string | null;
          duration_mode: Database['public']['Enums']['duration_mode'];
          planned_duration_seconds: number | null;
          started_at: string;
          ends_at: string | null;
          total_paused_seconds: number;
          paused_at: string | null;
          frozen_remaining_seconds: number | null;
          frozen_at: string | null;
          resumed_from_session_id: string | null;
          status: Database['public']['Enums']['session_status'];
          actual_duration_seconds: number | null;
          final_amount_cents: number | null;
          alert_fired: boolean;
          ended_at: string | null;
          ended_by: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['sessions']['Row']> & {
          tenant_id: string;
          branch_id: string;
          station_id: string;
        };
        Update: Partial<Database['public']['Tables']['sessions']['Row']>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          tenant_id: string;
          branch_id: string | null;
          customer_id: string | null;
          purpose: Database['public']['Enums']['payment_purpose'];
          booking_id: string | null;
          session_id: string | null;
          amount_cents: number;
          currency: string;
          provider: Database['public']['Enums']['payment_provider'];
          method: Database['public']['Enums']['payment_method'] | null;
          status: Database['public']['Enums']['payment_status'];
          provider_payment_id: string | null;
          provider_invoice_id: string | null;
          provider_raw: Json | null;
          refunded_amount_cents: number;
          initiated_by: string | null;
          captured_at: string | null;
          failed_at: string | null;
          failure_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['payments']['Row']> & {
          tenant_id: string;
          purpose: Database['public']['Enums']['payment_purpose'];
          amount_cents: number;
          provider: Database['public']['Enums']['payment_provider'];
        };
        Update: Partial<Database['public']['Tables']['payments']['Row']>;
        Relationships: [];
      };
      queue_tickets: {
        Row: {
          id: string;
          tenant_id: string;
          branch_id: string;
          game_type_id: string;
          customer_id: string | null;
          customer_label: string | null;
          customer_phone: string | null;
          player_count: number;
          ticket_number: number;
          is_vip: boolean;
          status: Database['public']['Enums']['queue_ticket_status'];
          estimated_wait_minutes: number | null;
          called_at: string | null;
          seated_at: string | null;
          seated_session_id: string | null;
          expired_at: string | null;
          notes: string | null;
          held_payment_id: string | null;
          paid_amount_cents: number;
          paid_from: 'card' | 'cash' | 'wallet' | 'mixed' | null;
          notification_expires_at: string | null;
          wallet_credit_ledger_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['queue_tickets']['Row']> & {
          tenant_id: string;
          branch_id: string;
          game_type_id: string;
          ticket_number: number;
        };
        Update: Partial<Database['public']['Tables']['queue_tickets']['Row']>;
        Relationships: [];
      };
      activity_log: {
        Row: {
          id: string;
          tenant_id: string;
          branch_id: string | null;
          actor_id: string | null;
          actor_role: Database['public']['Enums']['app_role'] | null;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          before: Json | null;
          after: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          occurred_at: string;
        };
        Insert: Partial<Database['public']['Tables']['activity_log']['Row']> & {
          tenant_id: string;
          action: string;
        };
        Update: Partial<Database['public']['Tables']['activity_log']['Row']>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          tenant_id: string;
          customer_id: string | null;
          channel: Database['public']['Enums']['notification_channel'];
          template_code: string | null;
          payload: Json;
          rendered_body: string | null;
          status: Database['public']['Enums']['notification_status'];
          provider_message_id: string | null;
          send_after: string;
          sent_at: string | null;
          delivered_at: string | null;
          read_at: string | null;
          error: string | null;
          retries: number;
          reference_type: string | null;
          reference_id: string | null;
          category: 'utility' | 'marketing' | 'service' | 'authentication' | null;
          was_free: boolean;
          estimated_cost_cents: number;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['notifications']['Row']> & {
          tenant_id: string;
          channel: Database['public']['Enums']['notification_channel'];
          payload: Json;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Row']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_public_venue_state: {
        Args: { p_branch_id: string };
        Returns: Json;
      };
      get_public_branch_by_code: {
        Args: { p_branch_code: string };
        Returns: string;
      };
      is_phone_registered: {
        Args: { p_phone: string; p_exclude_user_id?: string | null };
        Returns: boolean;
      };
      wallet_credit: {
        Args: {
          p_tenant_id: string;
          p_customer_id: string;
          p_amount_cents: number;
          p_kind: Database['public']['Enums']['wallet_entry_kind'];
          p_reason?: string | null;
          p_reference_type?: string | null;
          p_reference_id?: string | null;
          p_metadata?: Json | null;
          p_created_by?: string | null;
        };
        Returns: Json;
      };
      wallet_debit: {
        Args: {
          p_tenant_id: string;
          p_customer_id: string;
          p_amount_cents: number;
          p_kind: Database['public']['Enums']['wallet_entry_kind'];
          p_reason?: string | null;
          p_reference_type?: string | null;
          p_reference_id?: string | null;
          p_metadata?: Json | null;
          p_created_by?: string | null;
        };
        Returns: Json;
      };
      loyalty_award_points: {
        Args: {
          p_tenant_id: string;
          p_customer_id: string;
          p_points: number;
          p_reason: string;
          p_reference_type?: string | null;
          p_reference_id?: string | null;
          p_actor_id?: string | null;
        };
        Returns: Json;
      };
      is_station_free_for_window: {
        Args: {
          p_station_id: string;
          p_start: string;
          p_end: string;
          p_exclude_booking_id?: string | null;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: 'super_admin' | 'tenant_admin' | 'manager' | 'staff' | 'customer';
      tenant_status: 'trial' | 'active' | 'suspended' | 'cancelled';
      branch_status: 'active' | 'maintenance' | 'closed';
      booking_status:
        | 'pending'
        | 'confirmed'
        | 'checked_in'
        | 'in_session'
        | 'completed'
        | 'cancelled'
        | 'no_show'
        | 'expired';
      wallet_entry_kind:
        | 'credit_cancellation'
        | 'credit_topup'
        | 'credit_offer'
        | 'credit_referral'
        | 'credit_admin'
        | 'debit_booking'
        | 'debit_queue'
        | 'debit_purchase'
        | 'debit_admin';
      game_category: 'billiard' | 'bowling' | 'ping_pong' | 'karaoke' | 'foosball' | 'ps5' | 'vr' | 'arcade' | 'other';
      station_status: 'available' | 'occupied' | 'reserved' | 'maintenance' | 'cleaning';
      pricing_unit: 'per_minute' | 'per_hour' | 'per_session' | 'per_player_hour';
      duration_mode: 'open' | 'fixed_30' | 'fixed_60' | 'custom';
      session_status: 'active' | 'paused' | 'extended' | 'ended' | 'frozen';
      queue_ticket_status: 'waiting' | 'called' | 'seated' | 'expired' | 'cancelled';
      payment_provider: 'moyasar' | 'hyperpay' | 'cash' | 'manual';
      payment_method: 'mada' | 'visa' | 'mastercard' | 'apple_pay' | 'stc_pay' | 'cash' | 'wallet';
      payment_status: 'initiated' | 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded' | 'partially_refunded' | 'cancelled';
      payment_purpose: 'deposit' | 'session' | 'extension' | 'top_up' | 'reward_purchase' | 'queue_hold' | 'wallet_topup' | 'other';
      loyalty_tier: 'silver' | 'gold' | 'platinum' | 'vip' | 'diamond';
      notification_channel: 'whatsapp' | 'sms' | 'email' | 'push' | 'in_app';
      notification_status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
    };
  };
}
