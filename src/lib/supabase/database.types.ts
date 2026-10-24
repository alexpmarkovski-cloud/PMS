export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          cached_input_tokens: number
          case_id: string
          created_at: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          provider: string
          succeeded: boolean
        }
        Insert: {
          cached_input_tokens?: number
          case_id: string
          created_at?: string
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          provider: string
          succeeded?: boolean
        }
        Update: {
          cached_input_tokens?: number
          case_id?: string
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          provider?: string
          succeeded?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_events: {
        Row: {
          actor_id: string | null
          case_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          case_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          case_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "case_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_media: {
        Row: {
          case_id: string
          created_at: string
          id: string
          media_type: Database["public"]["Enums"]["media_type"]
          position: number
          storage_path: string
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          position?: number
          storage_path: string
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          position?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_media_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          cited_sources: Json
          confidence: number | null
          created_at: string
          description: string
          disclaimer: string
          id: string
          jurisdiction_id: string | null
          lease_id: string
          model_used: string | null
          property_id: string
          reasoning_summary: string | null
          responsible_party:
            | Database["public"]["Enums"]["responsible_party"]
            | null
          status: Database["public"]["Enums"]["case_status"]
          tenant_id: string
        }
        Insert: {
          cited_sources?: Json
          confidence?: number | null
          created_at?: string
          description: string
          disclaimer?: string
          id?: string
          jurisdiction_id?: string | null
          lease_id: string
          model_used?: string | null
          property_id: string
          reasoning_summary?: string | null
          responsible_party?:
            | Database["public"]["Enums"]["responsible_party"]
            | null
          status?: Database["public"]["Enums"]["case_status"]
          tenant_id: string
        }
        Update: {
          cited_sources?: Json
          confidence?: number | null
          created_at?: string
          description?: string
          disclaimer?: string
          id?: string
          jurisdiction_id?: string | null
          lease_id?: string
          model_used?: string | null
          property_id?: string
          reasoning_summary?: string | null
          responsible_party?:
            | Database["public"]["Enums"]["responsible_party"]
            | null
          status?: Database["public"]["Enums"]["case_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jurisdictions: {
        Row: {
          city: string | null
          county: string | null
          embedding: string | null
          id: string
          source_citation: string
          state: string
          summary_text: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          county?: string | null
          embedding?: string | null
          id?: string
          source_citation: string
          state: string
          summary_text: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          county?: string | null
          embedding?: string | null
          id?: string
          source_citation?: string
          state?: string
          summary_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      leases: {
        Row: {
          created_at: string
          effective_date: string | null
          extracted_text: string
          file_path: string
          id: string
          property_id: string
          tenant_id: string
          version: number
        }
        Insert: {
          created_at?: string
          effective_date?: string | null
          extracted_text: string
          file_path: string
          id?: string
          property_id: string
          tenant_id: string
          version?: number
        }
        Update: {
          created_at?: string
          effective_date?: string | null
          extracted_text?: string
          file_path?: string
          id?: string
          property_id?: string
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "leases_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      properties: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          created_at: string
          id: string
          landlord_id: string
          postal_code: string
          state: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          created_at?: string
          id?: string
          landlord_id: string
          postal_code: string
          state: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          created_at?: string
          id?: string
          landlord_id?: string
          postal_code?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_alert_recipients: {
        Row: {
          created_at: string
          property_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          property_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_alert_recipients_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_alert_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_collaborators: {
        Row: {
          created_at: string
          property_id: string
          role: Database["public"]["Enums"]["collaborator_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          property_id: string
          role: Database["public"]["Enums"]["collaborator_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          property_id?: string
          role?: Database["public"]["Enums"]["collaborator_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_collaborators_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_collaborators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_tenants: {
        Row: {
          created_at: string
          property_id: string
          status: Database["public"]["Enums"]["tenant_status"]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          property_id: string
          status?: Database["public"]["Enums"]["tenant_status"]
          tenant_id: string
        }
        Update: {
          created_at?: string
          property_id?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_tenants_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_case: { Args: { cid: string }; Returns: boolean }
      can_update_case: { Args: { cid: string }; Returns: boolean }
      collab_role: {
        Args: { pid: string }
        Returns: Database["public"]["Enums"]["collaborator_role"]
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_admin: { Args: never; Returns: boolean }
      is_case_tenant: { Args: { cid: string }; Returns: boolean }
      is_property_member: {
        Args: { pid: string; uid: string }
        Returns: boolean
      }
      is_tenant_of_property: { Args: { pid: string }; Returns: boolean }
      manages_profile: { Args: { target: string }; Returns: boolean }
      manages_property: { Args: { pid: string }; Returns: boolean }
      owns_property: { Args: { pid: string }; Returns: boolean }
    }
    Enums: {
      case_status:
        | "pending_ai_review"
        | "ai_review_completed"
        | "landlord_responsible"
        | "tenant_responsible"
        | "completed"
      collaborator_role: "manager" | "maintenance" | "attorney"
      media_type: "photo" | "video"
      responsible_party: "landlord" | "tenant" | "unclear"
      tenant_status: "current" | "former"
      user_role: "tenant" | "landlord" | "admin" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      case_status: [
        "pending_ai_review",
        "ai_review_completed",
        "landlord_responsible",
        "tenant_responsible",
        "completed",
      ],
      collaborator_role: ["manager", "maintenance", "attorney"],
      media_type: ["photo", "video"],
      responsible_party: ["landlord", "tenant", "unclear"],
      tenant_status: ["current", "former"],
      user_role: ["tenant", "landlord", "admin", "staff"],
    },
  },
} as const

