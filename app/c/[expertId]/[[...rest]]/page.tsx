import type { Metadata } from "next";
import ChatPanel from "@/components/ChatPanel";
import { loadExpert } from "@/lib/experts";
import { isValidExpertId } from "@/lib/expertId";

interface Params {
  expertId: string;
  rest?: string[];
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { expertId } = await params;
  if (!isValidExpertId(expertId)) return {};
  try {
    const expert = await loadExpert(expertId);
    return {
      title: expert.name,
      icons: { icon: `/api/expert-icon/${expertId}` },
    };
  } catch {
    return {};
  }
}

export default async function ChatRoute({
  params,
}: {
  params: Promise<Params>;
}) {
  const { expertId, rest } = await params;
  const chatId = rest && rest.length > 0 ? rest[0] : null;
  return <ChatPanel initialExpertId={expertId} initialChatId={chatId} />;
}
