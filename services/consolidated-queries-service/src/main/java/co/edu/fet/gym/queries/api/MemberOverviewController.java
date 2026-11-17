package co.edu.fet.gym.queries.api;

import co.edu.fet.gym.queries.application.MemberOverviewQueryService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** API interna de solo lectura consumida por el GraphQL Gateway (contracts/openapi/consolidated-queries-api.yaml). */
@RestController
@RequestMapping("/member-overviews")
class MemberOverviewController {

    private final MemberOverviewQueryService queries;

    MemberOverviewController(MemberOverviewQueryService queries) {
        this.queries = queries;
    }

    @GetMapping("/{memberId}")
    MemberOverviewResponse getOverview(@PathVariable @Min(1) long memberId) {
        return MemberOverviewResponse.from(queries.getOverview(memberId));
    }

    @GetMapping("/{memberId}/recent-accesses")
    List<AccessAttemptResponse> getRecentAccesses(
            @PathVariable @Min(1) long memberId,
            @RequestParam(defaultValue = "" + MemberOverviewQueryService.DEFAULT_RECENT_ACCESSES)
            @Min(1) @Max(MemberOverviewQueryService.MAX_RECENT_ACCESSES) int limit) {
        return queries.getRecentAccesses(memberId, limit).stream().map(AccessAttemptResponse::from).toList();
    }
}
