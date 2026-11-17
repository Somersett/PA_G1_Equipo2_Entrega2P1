package co.edu.fet.gym.queries.api;

import co.edu.fet.gym.queries.domain.model.Member;
import co.edu.fet.gym.queries.domain.model.MemberOverview;
import co.edu.fet.gym.queries.domain.model.Membership;
import co.edu.fet.gym.queries.domain.model.MembershipStatus;

import java.time.LocalDate;
import java.time.OffsetDateTime;

record MemberOverviewResponse(MemberResponse member, MembershipResponse membership) {

    static MemberOverviewResponse from(MemberOverview overview) {
        Membership membership = overview.membership();
        return new MemberOverviewResponse(
                MemberResponse.from(overview.member()),
                membership == null ? null : MembershipResponse.from(membership));
    }

    record MemberResponse(long id, String document, String name, String phone, String email, OffsetDateTime createdAt) {

        static MemberResponse from(Member member) {
            return new MemberResponse(member.id(), member.document(), member.name(), member.phone(), member.email(),
                    member.createdAt());
        }
    }

    record MembershipResponse(
            long id,
            long memberId,
            long planId,
            MembershipStatus status,
            LocalDate startDate,
            LocalDate endDate,
            OffsetDateTime createdAt) {

        static MembershipResponse from(Membership membership) {
            return new MembershipResponse(membership.id(), membership.memberId(), membership.planId(),
                    membership.status(), membership.startDate(), membership.endDate(), membership.createdAt());
        }
    }
}
